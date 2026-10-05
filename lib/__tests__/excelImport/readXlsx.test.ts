import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  XlsxReadError,
  cellText,
  colToIndex,
  getCell,
  indexToCol,
  parseRef,
  readXlsx,
  type XlsxSheet,
} from "../../excelImport/readXlsx";
import { MAX_CELLS_PER_SHEET, MAX_SHEETS, MAX_STRING_LENGTH, MAX_XLSX_BYTES } from "../../excelImport/limits";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

interface TestSheet {
  name: string;
  /** Raw <sheetData> inner XML, or rows of raw <c> XML strings. */
  rowsXml?: string;
  merges?: string[];
  file?: string; // zip path under xl/worksheets/, to prove names are not assumed
  rel?: string; // relationship type suffix, default worksheet
}

async function buildXlsx(opts: { sheets: TestSheet[]; sharedStrings?: string; extra?: Record<string, string | Uint8Array>; noWorkbook?: boolean; noContentTypes?: boolean }) {
  const zip = new JSZip();
  if (!opts.noContentTypes) zip.file("[Content_Types].xml", "<Types/>");
  if (!opts.noWorkbook) {
    zip.file("xl/workbook.xml", `<workbook ${NS}><sheets>${opts.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 10}" r:id="rId${i + 7}"/>`).join("")}</sheets></workbook>`);
    zip.file(
      "xl/_rels/workbook.xml.rels",
      `<Relationships>${opts.sheets.map((s, i) => `<Relationship Id="rId${i + 7}" Type="${REL}/${s.rel ?? "worksheet"}" Target="${s.rel ? "chartsheets" : "worksheets"}/${s.file ?? `sheet${i + 1}.xml`}"/>`).join("")}<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/></Relationships>`
    );
  }
  opts.sheets.forEach((s, i) => {
    const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    zip.file(`xl/${s.rel ? "chartsheets" : "worksheets"}/${s.file ?? `sheet${i + 1}.xml`}`, `<worksheet ${NS}><sheetData>${s.rowsXml ?? ""}</sheetData>${merges}</worksheet>`);
  });
  if (opts.sharedStrings !== undefined) zip.file("xl/sharedStrings.xml", `<sst ${NS}>${opts.sharedStrings}</sst>`);
  for (const [k, v] of Object.entries(opts.extra ?? {})) zip.file(k, v);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const row = (r: number, ...cells: string[]) => `<row r="${r}">${cells.join("")}</row>`;
const one = async (cells: string, sharedStrings?: string): Promise<XlsxSheet> => (await readXlsx(await buildXlsx({ sheets: [{ name: "S", rowsXml: row(1, cells) }], sharedStrings }))).sheets[0];

describe("ref helpers", () => {
  it("converts columns both ways", () => {
    expect(colToIndex("A")).toBe(1);
    expect(colToIndex("P")).toBe(16);
    expect(colToIndex("p")).toBe(16);
    expect(colToIndex("AA")).toBe(27);
    expect(colToIndex("XFD")).toBe(16384);
    expect(colToIndex("")).toBe(0);
    expect(colToIndex("A1")).toBe(0);
    expect(indexToCol(1)).toBe("A");
    expect(indexToCol(16)).toBe("P");
    expect(indexToCol(26)).toBe("Z");
    expect(indexToCol(27)).toBe("AA");
    expect(indexToCol(702)).toBe("ZZ");
    expect(indexToCol(703)).toBe("AAA");
    expect(indexToCol(16384)).toBe("XFD");
    expect(indexToCol(0)).toBe("");
    expect(indexToCol(16385)).toBe("");
    for (const n of [1, 25, 26, 27, 52, 53, 701, 702, 703, 16384]) expect(colToIndex(indexToCol(n))).toBe(n);
  });
  it("parses refs", () => {
    expect(parseRef("P28")).toEqual({ row: 28, col: 16 });
    expect(parseRef("$B$3")).toEqual({ row: 3, col: 2 });
    expect(parseRef("A0")).toBeNull();
    expect(parseRef("1A")).toBeNull();
    expect(parseRef("A")).toBeNull();
    expect(parseRef("A1B")).toBeNull();
    expect(parseRef("XFE1")).toBeNull();
    expect(parseRef("A1048577")).toBeNull();
    expect(parseRef("A".repeat(5000))).toBeNull();
  });
});

describe("readXlsx values", () => {
  it("reads shared strings, rich text (phonetic runs ignored), and in-cell newlines", async () => {
    const ss =
      `<si><t>Plain</t></si>` +
      `<si><r><t xml:space="preserve">Hello </t></r><r><rPr><b/></rPr><t>world</t></r><rPh sb="0" eb="1"><t>IGNORED</t></rPh></si>` +
      `<si><t>Line1\nLine2&#10;Line3&amp;&lt;x&gt;_x000D_Line4</t></si>`;
    const sheet = await one(`<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>`, ss);
    expect(cellText(sheet, 1, 1)).toBe("Plain");
    expect(getCell(sheet, 1, 2)).toEqual({ value: "Hello world", text: "Hello world", isFormula: false });
    expect(cellText(sheet, 1, 3)).toBe("Line1\nLine2\nLine3&<x>\nLine4");
  });
  it("reads inline strings, booleans, numbers and error cells", async () => {
    const sheet = await one(
      `<c r="A1" t="inlineStr"><is><t>Inline</t></is></c>` +
        `<c r="B1" t="inlineStr"><is><r><t>a</t></r><r><t>b</t></r><rPh><t>no</t></rPh></is></c>` +
        `<c r="C1" t="b"><v>1</v></c><c r="D1" t="b"><v>0</v></c>` +
        `<c r="E1"><v>46188</v></c><c r="F1" t="n"><v>3.5</v></c><c r="G1" t="e"><v>#DIV/0!</v></c>`
    );
    expect(getCell(sheet, 1, 1)?.value).toBe("Inline");
    expect(cellText(sheet, 1, 2)).toBe("ab");
    expect(getCell(sheet, 1, 3)).toEqual({ value: true, text: "TRUE", isFormula: false });
    expect(getCell(sheet, 1, 4)?.value).toBe(false);
    expect(getCell(sheet, 1, 5)).toEqual({ value: 46188, text: "46188", isFormula: false });
    expect(getCell(sheet, 1, 6)?.value).toBe(3.5);
    expect(getCell(sheet, 1, 7)).toBeUndefined();
  });
  it("uses the cached value of formulas", async () => {
    const sheet = await one(`<c r="A1"><f>SUM(1,2)</f><v>3</v></c><c r="B1" t="str"><f>"a"&amp;"b"</f><v>ab</v></c><c r="C1"><f t="shared" si="0"/><v>7</v></c><c r="D1"><f>NOW()</f></c>`);
    expect(getCell(sheet, 1, 1)).toEqual({ value: 3, text: "3", isFormula: true });
    expect(getCell(sheet, 1, 2)).toEqual({ value: "ab", text: "ab", isFormula: true });
    expect(getCell(sheet, 1, 3)?.value).toBe(7);
    expect(getCell(sheet, 1, 4)).toEqual({ value: null, text: "", isFormula: true });
  });
  it("skips empty cells, tracks max row/col, and falls back to position when r is missing", async () => {
    const xml = `<row><c><v>1</v></c><c/><c><v>2</v></c></row><row r="5"><c r="D5"><v>9</v></c></row>`;
    const wb = await readXlsx(await buildXlsx({ sheets: [{ name: "S", rowsXml: xml }] }));
    const s = wb.sheets[0];
    expect(s.cells.size).toBe(3);
    expect(getCell(s, 1, 1)?.value).toBe(1);
    expect(getCell(s, 1, 3)?.value).toBe(2);
    expect(s.maxRow).toBe(5);
    expect(s.maxCol).toBe(4);
    expect(wb.truncated).toBe(false);
  });
  it("accepts an ArrayBuffer and namespace-prefixed tags", async () => {
    const bytes = await buildXlsx({ sheets: [{ name: "S", rowsXml: "" }] });
    const zip = await JSZip.loadAsync(bytes);
    zip.file("xl/worksheets/sheet1.xml", `<x:worksheet xmlns:x="m"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Hi</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`);
    const out = await zip.generateAsync({ type: "uint8array" });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    expect(cellText((await readXlsx(buf)).sheets[0], 1, 1)).toBe("Hi");
  });
});

describe("sheet mapping and merges", () => {
  it("maps names and order through rels with non-sequential file names, skipping non-worksheets", async () => {
    const wb = await readXlsx(
      await buildXlsx({
        sheets: [
          { name: "Second & Co", file: "sheet9.xml", rowsXml: row(1, `<c r="A1" t="inlineStr"><is><t>nine</t></is></c>`) },
          { name: "Chart", file: "chart1.xml", rel: "chartsheet" },
          { name: "First", file: "zzz.xml", rowsXml: row(1, `<c r="A1" t="inlineStr"><is><t>zzz</t></is></c>`) },
        ],
      })
    );
    expect(wb.sheets.map((s) => [s.name, s.index, cellText(s, 1, 1)])).toEqual([
      ["Second & Co", 0, "nine"],
      ["First", 1, "zzz"],
    ]);
  });
  it("reads merged ranges (1-based), single-cell merges, and ignores bad ones", async () => {
    const wb = await readXlsx(await buildXlsx({ sheets: [{ name: "S", merges: ["B2:D3", "A1", "bad", "E5:C4"] }] }));
    expect(wb.sheets[0].merges).toEqual([
      { r1: 2, c1: 2, r2: 3, c2: 4 },
      { r1: 1, c1: 1, r2: 1, c2: 1 },
      { r1: 4, c1: 3, r2: 5, c2: 5 },
    ]);
  });
  it("never opens parts other than the workbook, rels, shared strings and worksheets", async () => {
    // A corrupt unrelated part would make JSZip stream fail if it were read.
    const bytes = await buildXlsx({ sheets: [{ name: "S" }], extra: { "xl/styles.xml": "<styleSheet/>", "docProps/app.xml": "x" } });
    expect((await readXlsx(bytes)).sheets).toHaveLength(1);
  });
});

describe("text hygiene", () => {
  it("strips control, zero-width and bidi characters but keeps newlines", async () => {
    const sheet = await one(`<c r="A1" t="inlineStr"><is><t>Lab​our&#8238; Day&#7;‮\u0000\r\nNext&#x200F;\t line⁦</t></is></c>`);
    expect(cellText(sheet, 1, 1)).toBe("Labour Day\nNext line");
  });
  it("truncates over-long text and flags the workbook instead of failing", async () => {
    const wb = await readXlsx(await buildXlsx({ sheets: [{ name: "S", rowsXml: row(1, `<c r="A1" t="inlineStr"><is><t>${"x".repeat(MAX_STRING_LENGTH + 500)}</t></is></c>`) }] }));
    expect(cellText(wb.sheets[0], 1, 1)).toHaveLength(MAX_STRING_LENGTH);
    expect(wb.truncated).toBe(true);
  });
  it("a giant shared string is truncated, not expanded", async () => {
    const wb = await readXlsx(await buildXlsx({ sheets: [{ name: "S", rowsXml: row(1, `<c r="A1" t="s"><v>0</v></c>`) }], sharedStrings: `<si><t>${"y".repeat(3_000_000)}</t></si>` }));
    expect(cellText(wb.sheets[0], 1, 1)).toHaveLength(MAX_STRING_LENGTH);
    expect(wb.truncated).toBe(true);
  });
});

describe("hostile input", () => {
  const fails = async (input: Uint8Array | ArrayBuffer, match?: RegExp) => {
    const t = Date.now();
    const err = await readXlsx(input).catch((e) => e);
    expect(err).toBeInstanceOf(XlsxReadError);
    if (match) expect(err.message).toMatch(match);
    expect(Date.now() - t).toBeLessThan(4000);
  };
  const withSheet = (rowsXml: string) => buildXlsx({ sheets: [{ name: "S", rowsXml }] });
  const fastOk = async (xml: string) => {
    const t = Date.now();
    const out = await readXlsx(await withSheet(xml)).catch((e) => e);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(!(out instanceof Error) || out instanceof XlsxReadError).toBe(true);
  };

  it("not a zip", async () => fails(new TextEncoder().encode("just text"), /doesn't look like an Excel/));
  it("wrong magic", async () => fails(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), /doesn't look like an Excel/));
  it("truncated zip", async () => fails((await withSheet("")).slice(0, 30), /damaged/));
  it("missing workbook.xml", async () => fails(await buildXlsx({ sheets: [{ name: "S" }], noWorkbook: true }), /not an Excel workbook/));
  it("missing [Content_Types].xml", async () => fails(await buildXlsx({ sheets: [{ name: "S" }], noContentTypes: true }), /not an Excel workbook/));
  it("5 MB+ input", async () => {
    const big = new Uint8Array(MAX_XLSX_BYTES + 1);
    big.set([0x50, 0x4b, 3, 4]);
    await fails(big, /larger than 5 MB/);
  });
  it("zip bomb: declared size over 20 MB in any entry", async () => {
    const bytes = await buildXlsx({ sheets: [{ name: "S" }], extra: { "xl/media/bomb.bin": new Uint8Array(21 * 1024 * 1024) } });
    expect(bytes.byteLength).toBeLessThan(MAX_XLSX_BYTES);
    await fails(bytes, /too large to read safely/);
  });
  it("zip bomb: a worksheet over 8 MB", async () => {
    const bytes = await withSheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(9 * 1024 * 1024)}</t></is></c></row>`);
    expect(bytes.byteLength).toBeLessThan(MAX_XLSX_BYTES);
    await fails(bytes, /too large to read safely/);
  });
  it("zip bomb: a header that lies about the size is cut off while inflating", async () => {
    const bytes = await withSheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(9 * 1024 * 1024)}</t></is></c></row>`);
    // Rewrite the uncompressed size in every central-directory record to 100 bytes.
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i + 28 < bytes.length; i++) if (dv.getUint32(i, true) === 0x02014b50) dv.setUint32(i + 24, 100, true);
    await fails(bytes);
  });
  it("200k '<c' repeats", async () => fastOk("<c".repeat(200_000)));
  it("200k '<c' repeats closed by one '>'", async () => fastOk("<c".repeat(200_000) + ">"));
  it("unclosed comments, PIs and CDATA", async () => {
    await fastOk(`<row r="1"><c r="A1"><v>1</v></c></row><!--${"<!--".repeat(100_000)}`);
    await fastOk("<?x ".repeat(100_000));
    await fastOk("<![CDATA[ ".repeat(100_000));
  });
  it("unclosed tags nest past the depth cap", async () => {
    const bytes = await withSheet("<c>".repeat(100_000));
    await fails(bytes, /too complex/);
  });
  it("deep XML nesting", async () => fails(await withSheet("<a>".repeat(5000)), /too complex/));
  it("more than the allowed number of sheets", async () => {
    const sheets = Array.from({ length: MAX_SHEETS + 1 }, (_, i) => ({ name: `S${i}` }));
    await fails(await buildXlsx({ sheets }), /more than 40 sheets/);
  });
  it("more cells than one sheet may hold", async () => {
    const cells = Array.from({ length: MAX_CELLS_PER_SHEET + 1 }, (_, i) => `<c r="${indexToCol((i % 16000) + 1)}${Math.floor(i / 16000) + 1}"><v>1</v></c>`).join("");
    await fails(await withSheet(`<row r="1">${cells}</row>`), /too many cells/);
  });
  it("more cells in total than a workbook may hold", async () => {
    const cells = Array.from({ length: 90_000 }, (_, i) => `<c r="${indexToCol((i % 9000) + 1)}${Math.floor(i / 9000) + 1}"><v>1</v></c>`).join("");
    const sheets = Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, rowsXml: cells }));
    await fails(await buildXlsx({ sheets }), /too many cells/);
  });
  it("more shared strings than allowed", async () => {
    await fails(await buildXlsx({ sheets: [{ name: "S" }], sharedStrings: "<si><t>a</t></si>".repeat(100_001) }), /too complex/);
  });
  it("a sheet rel pointing at a missing file", async () => {
    const zip = await JSZip.loadAsync(await buildXlsx({ sheets: [{ name: "S" }] }));
    zip.remove("xl/worksheets/sheet1.xml");
    await fails(await zip.generateAsync({ type: "uint8array" }), /damaged/);
  });
  it("a path-traversing rel target cannot reach other parts", async () => {
    const zip = await JSZip.loadAsync(await buildXlsx({ sheets: [{ name: "S" }] }));
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId7" Type="${REL}/worksheet" Target="../../../etc/passwd"/></Relationships>`);
    const wb = await readXlsx(await zip.generateAsync({ type: "uint8array" }));
    expect(wb.sheets).toEqual([]);
  });
});
