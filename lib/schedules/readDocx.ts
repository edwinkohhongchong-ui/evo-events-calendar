import JSZip from "jszip";
import { MAX_DOC_LINES, MAX_DOCX_BYTES } from "./limits";
import { cleanText } from "./text";

export { MAX_DOCX_BYTES };
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 5000;

/** An error whose message is safe to show to the user as-is. */
export class DocxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxReadError";
  }
}

const NOT_DOCX = "That file doesn't look like a Word (.docx) document. Please save it as .docx and try again.";

function decodeEntities(s: string): string {
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

// word/document.xml of a real schedule is well under 1 MB; anything near this is not a schedule.
export const MAX_DOC_XML_BYTES = 8 * 1024 * 1024;
const MAX_XML_TOKENS = 1_500_000;
const MAX_READ_MS = 4000;
const MAX_NESTING = 8;
const MAX_CELL_CHARS = 50_000;
const TOO_COMPLEX = "This document is too complex to read.";
const TAG_NAME_RE = /^\/?([\w.:-]+)/;

/**
 * Paragraph text from word/document.xml. Table rows become one line, cells joined with " | ".
 *
 * Hand-rolled with indexOf instead of one big regex: every step moves forward
 * and each terminator is searched for once, so hostile input (thousands of "<"
 * with no ">", unclosed comments) cannot make the scan quadratic.
 */
export function paragraphsFromDocumentXml(xml: string): string[] {
  const lines: string[] = [];
  const cellStack: string[][] = [];
  const cellChars: number[] = [];
  const rowStack: string[][] = [];
  let para = "";
  let inPara = false;
  let inText = false;

  const finishLine = (text: string) => {
    if (!text) return;
    if (cellStack.length) {
      const top = cellStack.length - 1;
      cellChars[top] += text.length;
      if (cellChars[top] > MAX_CELL_CHARS) throw new DocxReadError(TOO_COMPLEX);
      cellStack[top].push(text);
    } else lines.push(text);
  };
  const tidy = (s: string) => cleanText(s);

  const onText = (text: string) => {
    if (inText && inPara) {
      para += decodeEntities(text);
      if (para.length > MAX_CELL_CHARS) throw new DocxReadError(TOO_COMPLEX);
    }
  };

  const onTag = (name: string, closing: boolean, selfClosing: boolean) => {
    switch (name) {
      case "w:p":
        if (closing) {
          if (inPara) finishLine(tidy(para));
          inPara = false;
          inText = false;
          para = "";
        } else if (!selfClosing) {
          inPara = true;
          para = "";
        }
        break;
      case "w:t":
        inText = !closing && !selfClosing;
        break;
      case "w:br":
      case "w:tab":
      case "w:cr":
        if (inPara && !closing) para += " ";
        break;
      case "w:tc":
        if (closing) {
          cellChars.pop();
          const cell = tidy((cellStack.pop() ?? []).join(" "));
          if (rowStack.length) rowStack[rowStack.length - 1].push(cell);
        } else if (!selfClosing) {
          if (cellStack.length >= MAX_NESTING) throw new DocxReadError(TOO_COMPLEX);
          cellStack.push([]);
          cellChars.push(0);
        }
        break;
      case "w:tr":
        if (closing) {
          const row = (rowStack.pop() ?? []).filter(Boolean).join(" | ");
          finishLine(row);
        } else if (!selfClosing) {
          if (rowStack.length >= MAX_NESTING) throw new DocxReadError(TOO_COMPLEX);
          rowStack.push([]);
        }
        break;
    }
  };

  const started = Date.now();
  let tokens = 0;
  let i = 0;
  // Position of the first ">" at or after some earlier "<". Reused while still ahead,
  // so a run of "<" with one far-away ">" is not rescanned for each "<".
  let gt = -1;
  while (i < xml.length) {
    if (++tokens > MAX_XML_TOKENS || (tokens % 256 === 0 && Date.now() - started > MAX_READ_MS)) {
      throw new DocxReadError("That document is too complex to read safely.");
    }
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      onText(xml.slice(i));
      break;
    }
    if (lt > i) onText(xml.slice(i, lt));

    // Comments, processing instructions and CDATA: skip to the terminator, found once.
    // A terminator that never comes means the rest of the file is one unclosed block.
    const skipTo = xml.startsWith("<!--", lt) ? "-->" : xml.startsWith("<?", lt) ? "?>" : xml.startsWith("<![CDATA[", lt) ? "]]>" : null;
    if (skipTo) {
      const end = xml.indexOf(skipTo, lt + 2);
      if (end === -1) break;
      i = end + skipTo.length;
      continue;
    }

    if (gt <= lt) {
      gt = xml.indexOf(">", lt + 1);
      if (gt === -1) break;
    }
    const nextLt = xml.indexOf("<", lt + 1);
    if (nextLt !== -1 && nextLt < gt) {
      // A "<" that never closes before the next "<": not a tag, move on one character.
      i = lt + 1;
      continue;
    }
    const body = xml.slice(lt + 1, gt);
    const m = TAG_NAME_RE.exec(body);
    if (m) onTag(m[1], body.charCodeAt(0) === 47 /* "/" */, body.charCodeAt(body.length - 1) === 47);
    i = gt + 1;
  }
  return lines;
}

interface Stream {
  on(event: "data", cb: (chunk: string) => void): Stream;
  on(event: "error", cb: () => void): Stream;
  on(event: "end", cb: () => void): Stream;
  pause(): Stream;
  resume(): Stream;
}

function readEntryCapped(file: JSZip.JSZipObject, cap: number): Promise<string> {
  // Streamed so a zip whose header lies about its size is still cut off at the cap.
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let total = 0;
    // internalStream exists at runtime but is missing from JSZip's type declarations.
    const stream = (file as unknown as { internalStream(t: "string"): Stream }).internalStream("string");
    stream
      .on("data", (chunk: string) => {
        total += chunk.length;
        if (total > cap) {
          stream.pause();
          reject(new DocxReadError(`That document is too large to read safely (more than ${cap / (1024 * 1024)} MB of text inside).`));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", () => reject(new DocxReadError(NOT_DOCX)))
      .on("end", () => resolve(chunks.join("")))
      .resume();
  });
}

export async function readDocxParagraphs(input: ArrayBuffer | Uint8Array): Promise<string[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_DOCX_BYTES) {
    throw new DocxReadError("That file is larger than 5 MB. Please upload a smaller Word document.");
  }
  // "PK" + 0x03 0x04: every zip (and so every .docx) starts this way.
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new DocxReadError(NOT_DOCX);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxReadError("That Word document could not be opened - it may be damaged. Try re-saving it as .docx.");
  }

  const files = Object.values(zip.files);
  if (files.length > MAX_ENTRIES) throw new DocxReadError("That document contains too many parts to read safely.");
  for (const f of files) {
    // JSZip keeps the declared sizes from the zip header on its internal data record.
    const declared = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof declared === "number" && declared > MAX_ENTRY_BYTES) {
      throw new DocxReadError("That document is too large to read safely (more than 20 MB of content inside).");
    }
  }

  const doc = zip.file("word/document.xml");
  if (!doc) {
    throw new DocxReadError("That file is a zip, but not a Word document (no document text found). Please upload a .docx file.");
  }
  const docDeclared = (doc as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (typeof docDeclared === "number" && docDeclared > MAX_DOC_XML_BYTES) {
    throw new DocxReadError("That document is too large to read safely (more than 8 MB of text inside).");
  }
  // The 20 MB entry cap above is the zip-bomb guard for every part; document.xml itself gets a much tighter one.
  const xml = await readEntryCapped(doc, MAX_DOC_XML_BYTES);
  const lines = paragraphsFromDocumentXml(xml);
  if (lines.length > MAX_DOC_LINES) {
    throw new DocxReadError(`That document has more than ${MAX_DOC_LINES} lines of text. Check it is the right file.`);
  }
  return lines;
}
