import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { NextRequest } from "next/server";

// Route-level checks that need no Supabase: auth is stubbed to "editor", and the
// existing calendar data is empty. (401/403 are covered by middleware/viewerPolicy tests.)
vi.mock("@/lib/authRoute", () => ({ requireRoleRoute: async () => null }));
vi.mock("@/lib/data", () => ({ getAllHolidays: async () => [], getAllSeasons: async () => [] }));
vi.mock("@/lib/schedules/readDocx", async () => await import("../../schedules/readDocx"));
vi.mock("@/lib/schedules/limits", async () => await import("../../schedules/limits"));
vi.mock("@/lib/schedules/upload", async () => await import("../../schedules/upload"));
vi.mock("@/lib/schedules/parseSchedule", async () => await import("../../schedules/parseSchedule"));
vi.mock("@/lib/schedules/classify", async () => await import("../../schedules/classify"));
vi.mock("@/lib/schedules/diff", async () => await import("../../schedules/diff"));
vi.mock("@/lib/schedules/planRows", async () => await import("../../schedules/planRows"));

import { POST } from "../../../app/api/schedules/parse/route";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

async function docx(lines: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", `<w:document ${W}><w:body>${lines.map(para).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

async function uploadRequest(bytes: Uint8Array, name: string): Promise<NextRequest> {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], name));
  // Serialise the multipart up front, then replay it as a chunked stream with no Content-Length,
  // like a client that omits (or lies about) the header.
  const serialised = new Response(form);
  const contentType = serialised.headers.get("content-type") as string;
  const all = new Uint8Array(await serialised.arrayBuffer());
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= all.byteLength) return controller.close();
      controller.enqueue(all.subarray(at, at + 65536));
      at += 65536;
    },
  });
  return new NextRequest("http://localhost/api/schedules/parse", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
    duplex: "half",
  } as never);
}

describe("POST /api/schedules/parse", () => {
  it("returns a plan for a good document", async () => {
    const bytes = await docx(["Education Schedules 2026", "Public Holidays", "Labour Day: 1 May 2026"]);
    const res = await POST(await uploadRequest(bytes, "schedule.docx"));
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.holidays[0]).toMatchObject({ name: "Labour Day", status: "new", matchKind: null });
  });

  it("rejects a name that is not .docx (415)", async () => {
    const res = await POST(await uploadRequest(await docx(["x"]), "schedule.doc"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/\.docx/);
  });

  it("rejects a .docx name whose bytes are not a zip (415)", async () => {
    const res = await POST(await uploadRequest(new TextEncoder().encode("%PDF-1.7 not a zip"), "fake.docx"));
    expect(res.status).toBe(415);
  });

  it("rejects an oversized body by its declared Content-Length (413)", async () => {
    const req = new NextRequest("http://localhost/api/schedules/parse", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(50 * 1024 * 1024) },
      body: "x",
    });
    expect((await POST(req)).status).toBe(413);
  });

  it("enforces the limit while reading when there is no Content-Length (413)", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0x50, 0x4b, 3, 4]);
    const res = await POST(await uploadRequest(big, "big.docx"));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/larger than 5 MB/);
  });

  it("reports a document with no dates in plain language (422) and a missing file (400)", async () => {
    const empty = await POST(await uploadRequest(await docx(["Nothing useful here"]), "x.docx"));
    expect(empty.status).toBe(422);
    const none = new NextRequest("http://localhost/api/schedules/parse", { method: "POST", body: new FormData() });
    expect((await POST(none)).status).toBe(400);
  });

  it("reports a document that produces too many rows as a 422 with the limit message", async () => {
    const lines = ["Education Schedules 2026", "Public Holidays", ...Array.from({ length: 301 }, (_, i) => `Event ${i}: 1 January 2026`)];
    const res = await POST(await uploadRequest(await docx(lines), "many.docx"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("This document produced more than 300 rows; check it is the right file.");
  });
});
