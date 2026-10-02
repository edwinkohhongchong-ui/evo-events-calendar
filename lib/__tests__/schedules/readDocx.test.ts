import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { DocxReadError, MAX_DOC_XML_BYTES, MAX_DOCX_BYTES, paragraphsFromDocumentXml, readDocxParagraphs } from "../../schedules/readDocx";

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

describe("hostile XML finishes quickly and fails or returns safely (ReDoS)", () => {
  const timed = (fn: () => unknown) => {
    const t = Date.now();
    let outcome: unknown;
    try {
      outcome = fn();
    } catch (e) {
      outcome = e;
    }
    return { ms: Date.now() - t, outcome };
  };
  const okOrReadError = (o: unknown) => expect(!(o instanceof Error) || o instanceof DocxReadError).toBe(true);

  it('"<a" repeated 200000 times with no ">"', () => {
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml("<a".repeat(200000)));
    expect(ms).toBeLessThan(1000);
    okOrReadError(outcome);
  });
  it('"<a" repeated with one ">" at the very end (the cached-terminator case)', () => {
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml("<a".repeat(200000) + ">"));
    expect(ms).toBeLessThan(1000);
    okOrReadError(outcome);
  });
  it("an unclosed comment", () => {
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml(`<w:p><w:r><w:t>Hi</w:t></w:r></w:p><!--${"<!--".repeat(200000)}`));
    expect(ms).toBeLessThan(1000);
    expect(outcome).toEqual(["Hi"]);
  });
  it("an unclosed processing instruction", () => {
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml(`<w:p><w:r><w:t>Hi</w:t></w:r></w:p>${"<?x ".repeat(200000)}`));
    expect(ms).toBeLessThan(1000);
    expect(outcome).toEqual(["Hi"]);
  });
  it("many unclosed comments / PIs interleaved", () => {
    const { ms } = timed(() => paragraphsFromDocumentXml("<!-- <? <![CDATA[ ".repeat(100000)));
    expect(ms).toBeLessThan(1000);
  });
  it("a document with a very large number of tags is refused instead of grinding", () => {
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml("<w:br/>".repeat(1_600_000)));
    expect(ms).toBeLessThan(3000);
    expect(outcome).toBeInstanceOf(DocxReadError);
  });
  it("a normal-sized many-tag document still reads", () => {
    const xml = doc(Array.from({ length: 5000 }, (_, i) => p(`Line ${i}`)).join(""));
    const { ms, outcome } = timed(() => paragraphsFromDocumentXml(xml));
    expect(ms).toBeLessThan(1000);
    expect((outcome as string[]).length).toBe(5000);
  });
  it("through the zip reader too: an 8 MB+ document.xml is refused", async () => {
    const big = await docx(doc(p("x".repeat(MAX_DOC_XML_BYTES + 1024))));
    expect(big.byteLength).toBeLessThan(MAX_DOCX_BYTES);
    const err = await readDocxParagraphs(big).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/too large to read safely/);
  });
  it("through the zip reader: hostile document.xml returns or fails fast", async () => {
    const t = Date.now();
    const bytes = await docx("<a".repeat(200000));
    const out = await readDocxParagraphs(bytes).catch((e) => e);
    expect(Date.now() - t).toBeLessThan(2000);
    okOrReadError(out);
  });
  it("refuses a document with an absurd number of lines", async () => {
    const bytes = await docx(doc(Array.from({ length: 5001 }, (_, i) => p(`L${i}`)).join("")));
    const err = await readDocxParagraphs(bytes).catch((e) => e);
    expect(err).toBeInstanceOf(DocxReadError);
    expect(err.message).toMatch(/more than 5000 lines/);
  });
});

describe("text hygiene while reading", () => {
  it("drops control, zero-width and bidi characters (including ones written as entities)", () => {
    const xml = doc(p("Lab\u200bour &#8238;Day&#7; \u202e1\u0000 May"));
    expect(paragraphsFromDocumentXml(xml)).toEqual(["Labour Day 1 May"]);
  });
  it("does not choke on stray < and unusual tags", () => {
    expect(paragraphsFromDocumentXml(`<w:p><w:r><w:t>a < b <> c</w:t></w:r></w:p>`)).toEqual(["a b c"]);
  });
});

describe("nested table hardening", () => {
  it("160k nested cell/row levels fail fast with DocxReadError", () => {
    const xml = "<w:tc><w:p><w:t>ab</w:t></w:p><w:tr>".repeat(160_000);
    expect(xml.length).toBeLessThan(MAX_DOC_XML_BYTES);
    const t = Date.now();
    expect(() => paragraphsFromDocumentXml(xml)).toThrow(DocxReadError);
    expect(() => paragraphsFromDocumentXml(xml)).toThrow("too complex");
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("a cell holding more than ~50 KB of text is refused", () => {
    const big = `<w:tr><w:tc>${("<w:p><w:t>" + "x".repeat(900) + "</w:t></w:p>").repeat(80)}</w:tc></w:tr>`;
    expect(() => paragraphsFromDocumentXml(big)).toThrow(DocxReadError);
  });

  it("ordinary tables (and a table inside a cell) still read", () => {
    const xml = "<w:tbl><w:tr><w:tc><w:p><w:t>A</w:t></w:p></w:tc><w:tc><w:tbl><w:tr><w:tc><w:p><w:t>B</w:t></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>";
    expect(paragraphsFromDocumentXml(xml).join("|")).toContain("A");
  });
});
