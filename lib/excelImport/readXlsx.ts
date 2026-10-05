import JSZip from "jszip";
import { hasZipMagic } from "../schedules/upload";
import { cleanNotes, cleanText } from "../schedules/text";
import {
  MAX_CELLS_PER_SHEET,
  MAX_CELLS_TOTAL,
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  MAX_MERGES_PER_SHEET,
  MAX_PART_XML_BYTES,
  MAX_READ_MS,
  MAX_SHARED_STRINGS,
  MAX_SHEETS,
  MAX_STRING_LENGTH,
  MAX_TOTAL_XML_BYTES,
  MAX_XLSX_BYTES,
  MAX_XML_DEPTH,
  MAX_XML_TOKENS,
} from "./limits";

/** An error whose message is safe to show to the user as-is. */
export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

export interface XlsxCell {
  /** Numbers are raw (dates are serials: the caller converts). Errors and empty results are null. */
  value: string | number | boolean | null;
  /** Display text: rich-text runs joined, in-cell newlines kept as "\n", unsafe characters removed. */
  text: string;
  /** True when the cell has a formula; value/text are then Excel's cached result. */
  isFormula: boolean;
}

export interface XlsxMerge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface XlsxSheet {
  name: string;
  /** 0-based position among the workbook's worksheets, in workbook order. */
  index: number;
  /** Keyed "A1" style. Only cells with a value (or a formula) are present. */
  cells: Map<string, XlsxCell>;
  /** 1-based, inclusive. */
  merges: XlsxMerge[];
  /** Largest row / column that holds a cell (0 for an empty sheet). */
  maxRow: number;
  maxCol: number;
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
  /** True when some cell text (or merge list) was cut to fit the limits. */
  truncated: boolean;
}

const NOT_XLSX = "That doesn't look like an Excel (.xlsx) file. Please save it as .xlsx and try again.";
const DAMAGED = "That Excel file could not be opened - it may be damaged. Try re-saving it as .xlsx.";
const TOO_COMPLEX = "This workbook is too complex to read safely.";
const MAX_COL = 16384; // XFD
const MAX_ROW = 1_048_576;

// ---------------------------------------------------------------------------
// Cell references

/** 'A' = 1, 'P' = 16, 'AA' = 27. Returns 0 for anything that is not 1-3 letters. */
export function colToIndex(col: string): number {
  if (col.length < 1 || col.length > 3) return 0;
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    const c = col.charCodeAt(i) & ~32; // upper-case ASCII letters
    if (c < 65 || c > 90) return 0;
    n = n * 26 + (c - 64);
  }
  return n;
}

/** 1 = 'A', 16 = 'P', 27 = 'AA'. Returns "" outside 1..16384. */
export function indexToCol(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > MAX_COL) return "";
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** 'P28' -> {row: 28, col: 16}; null when it is not a valid A1 reference inside Excel's grid. */
export function parseRef(ref: string): { row: number; col: number } | null {
  if (ref.length < 2 || ref.length > 11) return null;
  let i = ref.charCodeAt(0) === 36 /* "$" */ ? 1 : 0;
  const colStart = i;
  while (i < ref.length && (ref.charCodeAt(i) | 32) >= 97 && (ref.charCodeAt(i) | 32) <= 122) i++;
  const col = colToIndex(ref.slice(colStart, i));
  if (!col || col > MAX_COL) return null;
  if (ref.charCodeAt(i) === 36) i++;
  const digits = ref.slice(i);
  for (let k = 0; k < digits.length; k++) {
    const d = digits.charCodeAt(k);
    if (d < 48 || d > 57) return null;
  }
  const row = digits ? parseInt(digits, 10) : 0;
  return row >= 1 && row <= MAX_ROW ? { row, col } : null;
}

export function getCell(sheet: XlsxSheet, row: number, col: number): XlsxCell | undefined {
  const c = indexToCol(col);
  return c && row >= 1 ? sheet.cells.get(`${c}${row}`) : undefined;
}

export function cellText(sheet: XlsxSheet, row: number, col: number): string {
  return getCell(sheet, row, col)?.text ?? "";
}

// ---------------------------------------------------------------------------
// Text

function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    // Surrogate halves are not characters; fromCodePoint accepts them but they break later encoding.
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}

/** Excel escapes characters XML cannot hold (e.g. a carriage return) as _x000D_. */
function decodeXEscapes(s: string): string {
  if (s.indexOf("_x") === -1) return s;
  return s.replace(/_x([0-9a-fA-F]{4})_/g, (m, h: string) => {
    const code = parseInt(h, 16);
    return code >= 0xd800 && code <= 0xdfff ? m : String.fromCharCode(code);
  });
}

/** Cell text: keeps "\n", turns tabs into spaces, drops control / zero-width / bidi characters. */
function cleanCell(raw: string): string {
  return cleanNotes(decodeXEscapes(raw).replace(/\t/g, " "));
}

// ---------------------------------------------------------------------------
// Linear XML scanner

interface Deadline {
  at: number;
}
const checkDeadline = (d: Deadline) => {
  if (Date.now() > d.at) throw new XlsxReadError(TOO_COMPLEX);
};

type Attrs = Map<string, string>;
const MAX_ATTR_BODY = 4096;
const MAX_ATTRS = 32;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/** Attributes of a tag body, in one forward pass. Bodies longer than 4 KB are ignored. */
function parseAttrs(body: string, from: number): Attrs {
  const out: Attrs = new Map();
  const n = body.length;
  if (n > MAX_ATTR_BODY) return out;
  let i = from;
  while (i < n && out.size < MAX_ATTRS) {
    while (i < n && (isSpace(body.charCodeAt(i)) || body.charCodeAt(i) === 47)) i++;
    const ks = i;
    while (i < n) {
      const c = body.charCodeAt(i);
      if (c === 61 || c === 47 || isSpace(c)) break;
      i++;
    }
    const key = body.slice(ks, i);
    while (i < n && isSpace(body.charCodeAt(i))) i++;
    if (body.charCodeAt(i) !== 61) {
      if (i === ks) i++; // never stall
      continue;
    }
    i++;
    while (i < n && isSpace(body.charCodeAt(i))) i++;
    const q = body.charCodeAt(i);
    if (q !== 34 && q !== 39) break;
    const end = body.indexOf(body[i], i + 1);
    if (end === -1) break;
    if (key) out.set(key, decodeEntities(body.slice(i + 1, end)));
    i = end + 1;
  }
  return out;
}

interface TagHandler {
  /** `name` has any namespace prefix removed. */
  (name: string, closing: boolean, selfClosing: boolean, attrs: () => Attrs): void;
}

/**
 * Walks XML with indexOf only: every step moves forward and each terminator is
 * searched for once, so hostile input cannot make it quadratic (same approach
 * as paragraphsFromDocumentXml in lib/schedules/readDocx.ts).
 */
function scanXml(xml: string, deadline: Deadline, onTag: TagHandler, onText: (text: string, raw: boolean) => void): void {
  let tokens = 0;
  let depth = 0;
  let i = 0;
  let gt = -1; // first ">" after some earlier "<", reused while still ahead
  while (i < xml.length) {
    if (++tokens > MAX_XML_TOKENS || (tokens % 256 === 0 && Date.now() > deadline.at)) throw new XlsxReadError(TOO_COMPLEX);
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      onText(xml.slice(i), false);
      return;
    }
    if (lt > i) onText(xml.slice(i, lt), false);

    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) return;
      onText(xml.slice(lt + 9, end), true);
      i = end + 3;
      continue;
    }
    const skipTo = xml.startsWith("<!--", lt) ? "-->" : xml.startsWith("<?", lt) ? "?>" : null;
    if (skipTo) {
      const end = xml.indexOf(skipTo, lt + 2);
      if (end === -1) return;
      i = end + skipTo.length;
      continue;
    }

    if (gt <= lt) {
      gt = xml.indexOf(">", lt + 1);
      if (gt === -1) return;
    }
    const nextLt = xml.indexOf("<", lt + 1);
    if (nextLt !== -1 && nextLt < gt) {
      i = lt + 1; // a "<" that never closes before the next "<": not a tag
      continue;
    }
    const body = xml.slice(lt + 1, gt);
    const closing = body.charCodeAt(0) === 47;
    const selfClosing = body.charCodeAt(body.length - 1) === 47;
    let ne = closing ? 1 : 0;
    const ns = ne;
    while (ne < body.length) {
      const c = body.charCodeAt(ne);
      if (c === 47 || isSpace(c)) break;
      ne++;
    }
    const full = body.slice(ns, ne);
    const name = full.slice(full.lastIndexOf(":") + 1);
    if (name) {
      if (closing) depth = Math.max(0, depth - 1);
      else if (!selfClosing && ++depth > MAX_XML_DEPTH) throw new XlsxReadError(TOO_COMPLEX);
      onTag(name, closing, selfClosing, () => parseAttrs(body, ne));
    }
    i = gt + 1;
  }
}

// ---------------------------------------------------------------------------
// Zip access

interface Stream {
  on(event: "data", cb: (chunk: string) => void): Stream;
  on(event: "error", cb: () => void): Stream;
  on(event: "end", cb: () => void): Stream;
  pause(): Stream;
  resume(): Stream;
}

/** Streamed, so a zip whose header lies about its size is still cut off at the cap. */
function readEntryCapped(file: JSZip.JSZipObject, cap: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let total = 0;
    const stream = (file as unknown as { internalStream(t: "string"): Stream }).internalStream("string");
    stream
      .on("data", (chunk: string) => {
        total += chunk.length;
        if (total > cap) {
          stream.pause();
          reject(new XlsxReadError(`That workbook is too large to read safely (more than ${cap / (1024 * 1024)} MB of data in one part).`));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", () => reject(new XlsxReadError(DAMAGED)))
      .on("end", () => resolve(chunks.join("")))
      .resume();
  });
}

const declaredSize = (f: JSZip.JSZipObject): number | undefined => (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

/** Resolves a relationship Target (relative to xl/, or absolute from the package root) to a zip path. */
function resolveTarget(target: string): string | null {
  const parts: string[] = [];
  for (const seg of (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.pop()) return null;
    } else parts.push(seg);
  }
  return parts.length ? parts.join("/") : null;
}

// ---------------------------------------------------------------------------
// Parts

class TextBuf {
  value = "";
  truncated = false;
  add(s: string) {
    if (this.value.length >= MAX_STRING_LENGTH) {
      if (s) this.truncated = true;
      return;
    }
    const room = MAX_STRING_LENGTH - this.value.length;
    if (s.length > room) {
      this.truncated = true;
      // Never leave half a surrogate pair at the cut.
      let cut = s.slice(0, room);
      const last = cut.charCodeAt(cut.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
      this.value += cut;
      return;
    }
    this.value += s;
  }
  reset() {
    this.value = "";
  }
}

function parseSharedStrings(xml: string, deadline: Deadline, flags: { truncated: boolean }): string[] {
  const out: string[] = [];
  const buf = new TextBuf();
  let inSi = false;
  let inT = false;
  let inPh = false;
  scanXml(
    xml,
    deadline,
    (name, closing, selfClosing) => {
      if (name === "si") {
        if (closing) {
          if (inSi) {
            if (out.length >= MAX_SHARED_STRINGS) throw new XlsxReadError(TOO_COMPLEX);
            out.push(cleanCell(buf.value));
            if (buf.truncated) flags.truncated = true;
          }
          inSi = false;
          inT = false;
          inPh = false;
        } else {
          if (inSi) out.push(cleanCell(buf.value)); // unclosed previous <si>: keep indices aligned
          buf.reset();
          buf.truncated = false;
          inSi = !selfClosing;
          if (selfClosing) out.push("");
        }
      } else if (name === "rPh") inPh = !closing && !selfClosing;
      else if (name === "t") inT = inSi && !closing && !selfClosing;
    },
    (text, raw) => {
      if (inT && !inPh) buf.add(raw ? text : decodeEntities(text));
    }
  );
  return out;
}

interface SheetRef {
  name: string;
  rid: string;
}

function parseWorkbookSheets(xml: string, deadline: Deadline): SheetRef[] {
  const out: SheetRef[] = [];
  scanXml(
    xml,
    deadline,
    (name, closing, _s, attrs) => {
      if (name !== "sheet" || closing) return;
      if (out.length >= MAX_SHEETS) throw new XlsxReadError(`That workbook has more than ${MAX_SHEETS} sheets. Check it is the right file.`);
      const a = attrs();
      let rid = a.get("r:id");
      if (rid === undefined) a.forEach((val, k) => {
        if (k.endsWith(":id")) rid = val;
      });
      if (rid !== undefined) out.push({ name: cleanText(decodeXEscapes(a.get("name") ?? "")).slice(0, 255), rid });
    },
    () => undefined
  );
  return out;
}

function parseRels(xml: string, deadline: Deadline): Map<string, string> {
  const out = new Map<string, string>();
  scanXml(
    xml,
    deadline,
    (name, closing, _s, attrs) => {
      if (name !== "Relationship" || closing) return;
      const a = attrs();
      const id = a.get("Id");
      const target = a.get("Target");
      if (id === undefined || target === undefined || a.get("TargetMode") === "External") return;
      // Only worksheets: chartsheets, themes, styles etc. are never opened.
      if (!(a.get("Type") ?? "").endsWith("/worksheet")) return;
      const path = resolveTarget(target);
      if (path && !out.has(id)) out.set(id, path);
    },
    () => undefined
  );
  return out;
}

function parseSheetXml(
  xml: string,
  name: string,
  index: number,
  shared: string[],
  deadline: Deadline,
  totals: { cells: number; truncated: boolean }
): XlsxSheet {
  const sheet: XlsxSheet = { name, index, cells: new Map(), merges: [], maxRow: 0, maxCol: 0 };

  let curRow = 0;
  let nextCol = 1;
  // Current <c>
  let active = false;
  let cRow = 0;
  let cCol = 0;
  let cType = "";
  let isFormula = false;
  const v = new TextBuf();
  const inl = new TextBuf();
  let inV = false;
  let inIs = false;
  let inT = false;
  let inPh = false;

  const finish = () => {
    if (!active) return;
    active = false;
    inV = inIs = inT = inPh = false;
    if (v.truncated || inl.truncated) totals.truncated = true;
    let value: XlsxCell["value"] = null;
    let text = "";
    const str = (s: string) => {
      text = cleanCell(s);
      value = text === "" ? null : text;
    };
    switch (cType) {
      case "s": {
        const s = shared[parseInt(v.value.trim(), 10)];
        if (s !== undefined) {
          text = s;
          value = s === "" ? null : s;
        }
        break;
      }
      case "inlineStr":
        str(inl.value);
        break;
      case "str":
      case "d":
        str(v.value);
        break;
      case "b":
        value = v.value.trim() === "1";
        text = value ? "TRUE" : "FALSE";
        break;
      case "e":
        break;
      default: {
        const raw = v.value.trim();
        if (raw === "") break;
        const num = Number(raw);
        if (Number.isFinite(num)) {
          value = num;
          text = raw;
        } else str(raw);
      }
    }
    if (value === null && text === "" && !isFormula) return;
    const col = indexToCol(cCol);
    if (!col || cRow < 1 || cRow > MAX_ROW) return;
    const key = `${col}${cRow}`;
    if (!sheet.cells.has(key)) {
      if (sheet.cells.size >= MAX_CELLS_PER_SHEET || totals.cells >= MAX_CELLS_TOTAL) {
        throw new XlsxReadError("That workbook has too many cells to read safely. Check it is the right file.");
      }
      totals.cells++;
    }
    sheet.cells.set(key, { value, text, isFormula });
    if (cRow > sheet.maxRow) sheet.maxRow = cRow;
    if (cCol > sheet.maxCol) sheet.maxCol = cCol;
  };

  scanXml(
    xml,
    deadline,
    (tag, closing, selfClosing, attrs) => {
      switch (tag) {
        case "row":
          if (closing) break;
          finish();
          {
            const r = parseInt(attrs().get("r") ?? "", 10);
            curRow = r >= 1 && r <= MAX_ROW ? r : curRow + 1;
            nextCol = 1;
          }
          break;
        case "c": {
          if (closing) {
            finish();
            break;
          }
          finish();
          const a = attrs();
          const ref = parseRef(a.get("r") ?? "");
          cRow = ref ? ref.row : curRow;
          cCol = ref ? ref.col : nextCol;
          nextCol = cCol + 1;
          if (selfClosing) break; // styled but empty
          active = true;
          cType = a.get("t") ?? "n";
          isFormula = false;
          v.reset();
          v.truncated = false;
          inl.reset();
          inl.truncated = false;
          break;
        }
        case "f":
          if (active && !closing) isFormula = true;
          break;
        case "v":
          inV = active && !closing && !selfClosing;
          break;
        case "is":
          inIs = active && !closing && !selfClosing;
          break;
        case "rPh":
          inPh = !closing && !selfClosing;
          break;
        case "t":
          inT = inIs && !closing && !selfClosing;
          break;
        case "mergeCell": {
          if (closing) break;
          const ref = attrs().get("ref") ?? "";
          const colon = ref.indexOf(":");
          const a = parseRef(colon === -1 ? ref : ref.slice(0, colon));
          const b = colon === -1 ? a : parseRef(ref.slice(colon + 1));
          if (!a || !b) break;
          if (sheet.merges.length >= MAX_MERGES_PER_SHEET) {
            totals.truncated = true;
            break;
          }
          sheet.merges.push({ r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) });
          break;
        }
      }
    },
    (text, raw) => {
      if (!active) return;
      const t = raw ? text : decodeEntities(text);
      if (inV) v.add(t);
      else if (inT && !inPh) inl.add(t);
    }
  );
  finish();
  return sheet;
}

// ---------------------------------------------------------------------------

export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<XlsxWorkbook> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_XLSX_BYTES) {
    throw new XlsxReadError("That file is larger than 5 MB. Please upload a smaller Excel workbook.");
  }
  if (!hasZipMagic(bytes)) throw new XlsxReadError(NOT_XLSX);
  const deadline: Deadline = { at: Date.now() + MAX_READ_MS };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new XlsxReadError(DAMAGED);
  }

  const files = Object.values(zip.files);
  if (files.length > MAX_ENTRIES) throw new XlsxReadError("That workbook contains too many parts to read safely.");
  for (const f of files) {
    const declared = declaredSize(f);
    if (typeof declared === "number" && declared > MAX_ENTRY_BYTES) {
      throw new XlsxReadError("That workbook is too large to read safely (more than 20 MB of content inside).");
    }
  }

  const workbookFile = zip.file("xl/workbook.xml");
  if (!zip.file("[Content_Types].xml") || !workbookFile) {
    throw new XlsxReadError("That file is a zip, but not an Excel workbook (no workbook found). Please upload an .xlsx file.");
  }

  let totalBytes = 0;
  const readPart = async (file: JSZip.JSZipObject): Promise<string> => {
    checkDeadline(deadline);
    const declared = declaredSize(file);
    if (typeof declared === "number" && declared > MAX_PART_XML_BYTES) {
      throw new XlsxReadError("That workbook is too large to read safely (more than 8 MB of data in one part).");
    }
    const xml = await readEntryCapped(file, MAX_PART_XML_BYTES);
    totalBytes += xml.length;
    if (totalBytes > MAX_TOTAL_XML_BYTES) throw new XlsxReadError("That workbook is too large to read safely.");
    return xml;
  };

  const refs = parseWorkbookSheets(await readPart(workbookFile), deadline);
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!relsFile) throw new XlsxReadError(DAMAGED);
  const rels = parseRels(await readPart(relsFile), deadline);

  const flags = { truncated: false };
  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile ? parseSharedStrings(await readPart(ssFile), deadline, flags) : [];

  const totals = { cells: 0, truncated: false };
  const sheets: XlsxSheet[] = [];
  for (const ref of refs) {
    const path = rels.get(ref.rid);
    if (!path) continue; // not a worksheet (e.g. a chartsheet)
    const file = zip.file(path);
    if (!file) throw new XlsxReadError(DAMAGED);
    const xml = await readPart(file);
    sheets.push(parseSheetXml(xml, ref.name, sheets.length, shared, deadline, totals));
  }
  return { sheets, truncated: flags.truncated || totals.truncated };
}
