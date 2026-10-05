import { beforeEach, describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { MARCH_WEEKS, monthSheet } from "./helpers";
import { indexToCol, type XlsxSheet } from "../../excelImport/readXlsx";
import type { ExcelExisting } from "../../excelImport/diffExcel";

// Route-level checks that need no Supabase: auth is stubbed to "editor" and the existing
// calendar data is injected. (401/403 are covered by middleware/viewerPolicy tests.)
// Synthetic data only: invented names, a workbook built in memory.
let existing: ExcelExisting | Error;
vi.mock("@/lib/authRoute", () => ({ requireRoleRoute: async () => null }));
vi.mock("@/lib/excelImport/loadExisting", () => ({
  loadExcelExisting: async () => {
    if (existing instanceof Error) throw existing;
    return existing;
  },
}));
vi.mock("@/lib/excelImport/readXlsx", async () => await import("../../excelImport/readXlsx"));
vi.mock("@/lib/excelImport/limits", async () => await import("../../excelImport/limits"));
vi.mock("@/lib/excelImport/parseCalendarSheets", async () => await import("../../excelImport/parseCalendarSheets"));
vi.mock("@/lib/excelImport/classifyExcel", async () => await import("../../excelImport/classifyExcel"));
vi.mock("@/lib/excelImport/diffExcel", async () => await import("../../excelImport/diffExcel"));
vi.mock("@/lib/excelImport/upload", async () => await import("../../excelImport/upload"));
vi.mock("@/lib/schedules/limits", async () => await import("../../schedules/limits"));
vi.mock("@/lib/schedules/upload", async () => await import("../../schedules/upload"));

import { POST } from "../../../app/api/excel/parse/route";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function sheetXml(s: XlsxSheet): string {
  const byRow = new Map<number, string[]>();
  for (const [ref, cell] of Array.from(s.cells.entries())) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const xml = typeof cell.value === "number" ? `<c r="${ref}"><v>${cell.value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.text)}</t></is></c>`;
    byRow.set(Number(m[2]), [...(byRow.get(Number(m[2])) ?? []), xml]);
  }
  const rows = Array.from(byRow.entries()).sort((a, b) => a[0] - b[0]).map(([r, cells]) => `<row r="${r}">${cells.join("")}</row>`).join("");
  const merges = s.merges.map((m) => `<mergeCell ref="${indexToCol(m.c1)}${m.r1}:${indexToCol(m.c2)}${m.r2}"/>`).join("");
  return `<worksheet ${NS}><sheetData>${rows}</sheetData>${merges ? `<mergeCells count="${s.merges.length}">${merges}</mergeCells>` : ""}</worksheet>`;
}

async function xlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("xl/workbook.xml", `<workbook ${NS}><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: "uint8array" });
}

const goodSheet = () => monthSheet("Mar-26", 28, [{ monday: MARCH_WEEKS[1], events: { 1: "\nY. Study Circle\n19:00 - 20:30" } }]);

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
  return new NextRequest("http://localhost/api/excel/parse", { method: "POST", headers: { "content-type": contentType }, body, duplex: "half" } as never);
}

beforeEach(() => {
  existing = {
    events: [], overrides: [], exceptions: [], seasons: [], holidays: [], checklist: [],
    levels: [{ id: "l1", name: "Youth", color_key: "indigo", sort_order: 1 }, { id: "l2", name: "Adults", color_key: "teal", sort_order: 2 }],
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/excel/parse", () => {
  it("returns the plan, the level names, the truncated flag and the file name for a good workbook (200)", async () => {
    const res = await POST(await uploadRequest(await xlsx([goodSheet()]), "calendar.xlsx"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["fileName", "levels", "notes", "plan", "truncated"]);
    expect(json.levels).toEqual(["Youth", "Adults"]);
    expect(json.truncated).toBe(false);
    expect(json.fileName).toBe("calendar.xlsx");
    expect(json.plan.events[0]).toMatchObject({ name: "Y: Study Circle", status: "new", op: "create", category: "Youth", start: "2026-03-03", time: "19:00" });
    expect(json.notes).toEqual({ ignoredSheets: [], sheetFlags: [] });
    // JSON-safe: survives a round trip unchanged.
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });

  it("marks an event already in the calendar as unchanged with no operation", async () => {
    existing = {
      ...(existing as ExcelExisting),
      events: [{
        id: "e1", name: "Y: Study Circle", event_date: "2026-03-03", end_date: null, event_time: "19:00:00", end_time: "20:30:00", duration_minutes: 90,
        level: "Youth", recurring: "None", repeat_until: null, notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00+00:00",
        event_type: "Event", pastoral_youth: true, pastoral_poly: false, pastoral_uni: false, pastoral_adults: false,
        location: null, gathering_type: null, series: null, preacher_name: null, sermon_title: null, theme: null,
      }],
    };
    const json = await (await POST(await uploadRequest(await xlsx([goodSheet()]), "calendar.xlsx"))).json();
    expect(json.plan.events[0]).toMatchObject({ status: "unchanged", op: null, existingId: "e1" });
  });

  it("rejects a name that is not .xlsx (415)", async () => {
    const res = await POST(await uploadRequest(await xlsx([goodSheet()]), "calendar.xls"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/\.xlsx/);
  });

  it("rejects an .xlsx name whose bytes are not a zip (415)", async () => {
    const res = await POST(await uploadRequest(new TextEncoder().encode("%PDF-1.7 not a zip"), "fake.xlsx"));
    expect(res.status).toBe(415);
  });

  it("rejects an oversized body by its declared Content-Length (413)", async () => {
    const req = new NextRequest("http://localhost/api/excel/parse", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(50 * 1024 * 1024) },
      body: "x",
    });
    expect((await POST(req)).status).toBe(413);
  });

  it("enforces the limit while reading when there is no Content-Length (413)", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set([0x50, 0x4b, 3, 4]);
    const res = await POST(await uploadRequest(big, "big.xlsx"));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/larger than 5 MB/);
  });

  it("reports a missing file (400)", async () => {
    const none = new NextRequest("http://localhost/api/excel/parse", { method: "POST", body: new FormData() });
    const res = await POST(none);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Choose an Excel/);
  });

  it("reports a damaged workbook in plain language (422), without a stack or internals", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a workbook");
    const res = await POST(await uploadRequest(await zip.generateAsync({ type: "uint8array" }), "odd.xlsx"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Excel/);
  });

  it("reports a workbook with nothing to import (422)", async () => {
    const res = await POST(await uploadRequest(await xlsx([monthSheet("Mar-26", 28, [])]), "empty.xlsx"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/could not find any events/);
  });

  it("returns a generic 500 and logs when reading the calendar fails", async () => {
    existing = new Error("connection string postgres://user:secret@host failed");
    const res = await POST(await uploadRequest(await xlsx([goodSheet()]), "calendar.xlsx"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toBe(JSON.stringify({ error: "Something went wrong reading that workbook. Please try again." }));
    expect(console.error).toHaveBeenCalled();
  });
});
