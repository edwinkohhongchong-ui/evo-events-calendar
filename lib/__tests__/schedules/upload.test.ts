import { describe, it, expect } from "vitest";
import { BodyTooLargeError, hasZipMagic, isDocxName, MAX_BODY_BYTES, readBodyCapped } from "../../schedules/upload";

function streamOf(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("readBodyCapped", () => {
  it("returns every byte of a body within the cap, in order", async () => {
    const out = await readBodyCapped(streamOf([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]), 10);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });
  it("accepts a body of exactly the cap and an empty or missing body", async () => {
    expect((await readBodyCapped(streamOf([new Uint8Array(10)]), 10)).byteLength).toBe(10);
    expect((await readBodyCapped(streamOf([]), 10)).byteLength).toBe(0);
    expect((await readBodyCapped(null, 10)).byteLength).toBe(0);
  });
  it("stops reading and cancels the stream as soon as the cap is passed (no Content-Length needed)", async () => {
    let cancelled = false;
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readBodyCapped(endless, 5000)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(20);
  });
  it("the route cap is the 5 MB file limit plus a little multipart framing", () => {
    expect(MAX_BODY_BYTES).toBeGreaterThan(5 * 1024 * 1024);
    expect(MAX_BODY_BYTES).toBeLessThan(5 * 1024 * 1024 + 256 * 1024);
  });
});

describe("file checks", () => {
  it("accepts .docx names in any case and nothing else", () => {
    expect(isDocxName("Education Schedules 2026.docx")).toBe(true);
    expect(isDocxName("X.DOCX")).toBe(true);
    for (const n of ["x.doc", "x.docx.exe", "docx", "x.docm", "x.pdf", ""]) expect(isDocxName(n), n).toBe(false);
  });
  it("requires the zip signature PK\\x03\\x04", () => {
    expect(hasZipMagic(new Uint8Array([0x50, 0x4b, 3, 4, 9]))).toBe(true);
    expect(hasZipMagic(new Uint8Array([0x50, 0x4b, 5, 6]))).toBe(false); // empty-archive marker
    expect(hasZipMagic(new TextEncoder().encode("%PDF-1.7"))).toBe(false);
    expect(hasZipMagic(new Uint8Array([0x50, 0x4b]))).toBe(false);
  });
});
