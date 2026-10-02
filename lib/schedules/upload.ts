import { MAX_DOCX_BYTES } from "./limits";

// Pure checks behind POST /api/schedules/parse, split out so they can be tested
// without a server. The size guard matters because Content-Length is only a hint:
// a client can omit it or lie, so the bytes are counted as they arrive.

// multipart framing adds a little to the file itself.
export const BODY_OVERHEAD_BYTES = 64 * 1024;
export const MAX_BODY_BYTES = MAX_DOCX_BYTES + BODY_OVERHEAD_BYTES;

export class BodyTooLargeError extends Error {
  constructor() {
    super("Upload body is too large.");
    this.name = "BodyTooLargeError";
  }
}

/** Reads a request body, stopping (and cancelling the stream) as soon as it passes maxBytes. */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export const isDocxName = (name: string): boolean => /\.docx$/i.test(name);

/** "PK" + 0x03 0x04: every zip (and so every .docx) starts this way. */
export function hasZipMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
