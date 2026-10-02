import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { SG_2026 } from "../fixtures/calendarificSg2026";

// Same stubs as parseRoute.test.ts, plus the Calendarific lookup, with fetch faked (no network).
vi.mock("@/lib/authRoute", () => ({ requireRoleRoute: async () => null }));
vi.mock("@/lib/data", () => ({ getAllHolidays: async () => [], getAllSeasons: async () => [] }));
vi.mock("@/lib/schedules/readDocx", async () => await import("../../schedules/readDocx"));
vi.mock("@/lib/schedules/limits", async () => await import("../../schedules/limits"));
vi.mock("@/lib/schedules/upload", async () => await import("../../schedules/upload"));
vi.mock("@/lib/schedules/parseSchedule", async () => await import("../../schedules/parseSchedule"));
vi.mock("@/lib/schedules/classify", async () => await import("../../schedules/classify"));
vi.mock("@/lib/schedules/diff", async () => await import("../../schedules/diff"));
vi.mock("@/lib/schedules/planRows", async () => await import("../../schedules/planRows"));
vi.mock("@/lib/schedules/holidayCheckRun", async () => await import("../../schedules/holidayCheckRun"));

import { POST } from "../../../app/api/schedules/parse/route";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

async function request(lines: string[]): Promise<NextRequest> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", `<w:document ${W}><w:body>${lines.map(para).join("")}</w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], "schedule.docx"));
  const serialised = new Response(form);
  const contentType = serialised.headers.get("content-type") as string;
  return new NextRequest("http://localhost/api/schedules/parse", {
    method: "POST",
    headers: { "content-type": contentType },
    body: new Uint8Array(await serialised.arrayBuffer()),
  });
}

const LINES = ["Education Schedules 2026", "Public Holidays", "Labour Day: 1 May 2026", "Hari Raya Puasa: 20 March 2026", "Founders Day: 7 July 2026"];
const calResponse = () =>
  new Response(
    JSON.stringify({
      response: { holidays: SG_2026.map((h) => ({ name: h.name, description: h.description, type: h.type, date: { iso: h.date, datetime: { year: 2026 } } })) },
    })
  );

beforeEach(() => vi.stubEnv("CALENDARIFIC_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parse route holiday check", () => {
  it("adds the check with match, differ and not-found results, and fetches the year once", async () => {
    const fetchMock = vi.fn(async () => calResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(await request(LINES));
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.holidayCheck).toMatchObject({ status: "ok", source: "Calendarific" });
    const byName = (n: string) => plan.holidays.find((h: { name: string }) => h.name === n).rowId;
    const result = (n: string) => plan.holidayCheck.rows.find((r: { rowId: string }) => r.rowId === byName(n)).result;
    expect(result("Labour Day")).toBe("match");
    expect(result("Hari Raya Puasa")).toBe("date-differs");
    expect(result("Founders Day")).toBe("not-found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a Calendarific failure does not fail the parse", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("boom");
    });
    const res = await POST(await request(LINES));
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan.holidays).toHaveLength(3);
    expect(plan.holidayCheck).toEqual({ status: "unavailable", source: "Calendarific", message: "Calendarific could not be reached" });
  });

  it("a missing key and a rate limit are reported, not thrown", async () => {
    vi.stubEnv("CALENDARIFIC_API_KEY", "");
    expect((await (await POST(await request(LINES))).json()).holidayCheck).toMatchObject({ status: "unavailable" });
    vi.stubEnv("CALENDARIFIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429 }));
    const plan = await (await POST(await request(LINES))).json();
    expect(plan.holidayCheck).toMatchObject({ status: "unavailable", message: expect.stringMatching(/limit/) });
  });

  it("asks for the next year too when a holiday falls in it", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const year = Number(/year=(\d+)/.exec(String(url))![1]);
      return new Response(JSON.stringify({ response: { holidays: [{ name: "New Year's Day", description: "", type: ["National holiday"], date: { iso: `${year}-01-01`, datetime: { year } } }] } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const plan = await (await POST(await request(["Education Schedules 2026", "Public Holidays", "New Year’s Day: 1 January 2027"]))).json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(plan.holidayCheck.rows[0].result).toBe("match");
  });
});
