import JSZip from "jszip";

export const MAX_DOCX_BYTES = 5 * 1024 * 1024;
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
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

const XML_TOKEN_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w.:-]+)([^>]*?)(\/?)>|([^<]+)/g;

/** Paragraph text from word/document.xml. Table rows become one line, cells joined with " | ". */
export function paragraphsFromDocumentXml(xml: string): string[] {
  const lines: string[] = [];
  const cellStack: string[][] = [];
  const rowStack: string[][] = [];
  let para = "";
  let inPara = false;
  let inText = false;

  const finishLine = (text: string) => {
    if (!text) return;
    if (cellStack.length) cellStack[cellStack.length - 1].push(text);
    else lines.push(text);
  };
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

  for (const m of Array.from(xml.matchAll(XML_TOKEN_RE))) {
    if (m[5] !== undefined) {
      if (inText && inPara) para += decodeEntities(m[5]);
      continue;
    }
    if (!m[2]) continue;
    const closing = m[1] === "/";
    const selfClosing = m[4] === "/";
    switch (m[2]) {
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
          const cell = tidy((cellStack.pop() ?? []).join(" "));
          if (rowStack.length) rowStack[rowStack.length - 1].push(cell);
        } else if (!selfClosing) cellStack.push([]);
        break;
      case "w:tr":
        if (closing) {
          const row = (rowStack.pop() ?? []).filter(Boolean).join(" | ");
          finishLine(row);
        } else if (!selfClosing) rowStack.push([]);
        break;
    }
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

function readEntryCapped(file: JSZip.JSZipObject): Promise<string> {
  // Streamed so a zip whose header lies about its size is still cut off at the cap.
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let total = 0;
    // internalStream exists at runtime but is missing from JSZip's type declarations.
    const stream = (file as unknown as { internalStream(t: "string"): Stream }).internalStream("string");
    stream
      .on("data", (chunk: string) => {
        total += chunk.length;
        if (total > MAX_ENTRY_BYTES) {
          stream.pause();
          reject(new DocxReadError("That document is too large to read safely (more than 20 MB of text inside)."));
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
  const xml = await readEntryCapped(doc);
  return paragraphsFromDocumentXml(xml);
}
