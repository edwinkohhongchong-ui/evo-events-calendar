import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { DocxReadError, MAX_DOCX_BYTES, paragraphsFromDocumentXml, readDocxParagraphs } from "../../schedules/readDocx";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (...runs: string[]) => `<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;
const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;

async function docx(documentXml: string | null, extra: Record<string, string | Uint8Array> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  if (documentXml !== null) zip.file("word/document.xml", documentXml);
  for (const [k, v] of Object.entries(extra)) zip.file(k, v);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("paragraphsFromDocumentXml", () => {
  it("joins runs, turns br/tab into spaces and decodes entities", () => {
    const xml = doc(
      `<w:p><w:r><w:t>Labour</w:t></w:r><w:r><w:t xml:space="preserve"> Day:</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>1 May &amp; 2026</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>New&#8217;s &#x41;</w:t></w:r></w:p>`
    );
    expect(paragraphsFromDocumentXml(xml)).toEqual(["Labour Day: 1 May & 2026 New’s A"]);
  });
  it("skips empty paragraphs and deleted/instruction text", () => {
    const xml = doc(`<w:p/><w:p><w:r><w:t></w:t></w:r></w:p>${p("Keep")}<w:p><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`);
    expect(paragraphsFromDocumentXml(xml)).toEqual(["Keep"]);
  });
  it("turns a table row into one line with cells joined by ' | '", () => {
    const cell = (t: string) => `<w:tc>${p(t)}</w:tc>`;
    const xml = doc(
      `${p("Before")}<w:tbl><w:tr>${cell("Oral")}${cell("12 August 2026")}</w:tr><w:tr>${cell("Written")}<w:tc>${p("24 Sep")}${p("1 Oct 2026")}</w:tc></w:tr></w:tbl>${p("After")}`
    );
    expect(paragraphsFromDocumentXml(xml)).toEqual(["Before", "Oral | 12 August 2026", "Written | 24 Sep 1 Oct 2026", "After"]);
  });
});

describe("readDocxParagraphs", () => {
  it("reads paragraphs and a table from a real zip", async () => {
    const cell = (t: string) => `<w:tc>${p(t)}</w:tc>`;
    const bytes = await docx(doc(`${p("Education Schedules 2026")}${p("Public Holidays")}<w:tbl><w:tr>${cell("A")}${cell("B")}</w:tr></w:tbl>`));
    expect(await readDocxParagraphs(bytes)).toEqual(["Education Schedules 2026", "Public Holidays", "A | B"]);
  });
  it("accepts an ArrayBuffer", async () => {
    const bytes = await docx(doc(p("Hi")));
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    expect(await readDocxParagraphs(buf)).toEqual(["Hi"]);
  });
  it("rejects a non-zip with a friendly message", async () => {
    const err = await readDocxParagraphs(new TextEncoder().encode("just some text")).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/doesn't look like a Word/);
  });
  it("rejects a corrupt zip without leaking the library's error", async () => {
    const good = await docx(doc(p("x")));
    const err = await readDocxParagraphs(good.slice(0, 20)).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/could not be opened/);
  });
  it("rejects files over 5 MB", async () => {
    const big = new Uint8Array(MAX_DOCX_BYTES + 1);
    big.set([0x50, 0x4b, 3, 4]);
    const err = await readDocxParagraphs(big).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/larger than 5 MB/);
  });
  it("rejects a zip with no word/document.xml", async () => {
    const err = await readDocxParagraphs(await docx(null, { "hello.txt": "hi" })).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/not a Word document/);
  });
  it("zip-bomb guard: an entry that expands past 20 MB is refused", async () => {
    // ~21 MB of zeros deflates to a few tens of KB, well under the 5 MB upload cap.
    const bomb = await docx(doc(p("x")), { "word/media/bomb.bin": new Uint8Array(21 * 1024 * 1024) });
    expect(bomb.byteLength).toBeLessThan(MAX_DOCX_BYTES);
    const err = await readDocxParagraphs(bomb).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/too large to read safely/);
  });
  it("zip-bomb guard also covers document.xml itself", async () => {
    const bomb = await docx(doc(p("x".repeat(21 * 1024 * 1024))));
    expect(bomb.byteLength).toBeLessThan(MAX_DOCX_BYTES);
    const err = await readDocxParagraphs(bomb).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/too large to read safely/);
  });
});
