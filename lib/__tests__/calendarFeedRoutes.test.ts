import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The routes import via "@/...", which this repo's vitest setup doesn't
// resolve; point the aliases at the real modules. Data loading is faked.
const readAll = vi.fn();
vi.mock("@/lib/readAll", () => ({ readAll: (...a: unknown[]) => readAll(...a) }));
vi.mock("@/lib/icsExport", async () => await import("../icsExport"));
vi.mock("@/lib/feedToken", async () => await import("../feedToken"));
vi.mock("@/lib/types", async () => await import("../types"));
vi.mock("@/lib/authRoute", () => ({ requireRoleRoute: async () => null }));

import { GET as feedGET } from "../../app/api/calendar-feed/[token]/route";
import { GET as exportGET } from "../../app/api/export/ics/route";

const TOKEN = "a".repeat(64);
const GENERIC = { error: "Couldn't load the calendar. Please try again." };
const feed = (token = TOKEN) =>
  feedGET(new NextRequest("http://localhost:3000/x"), { params: { token: `${token}.ics` } });

function load(failing: string | null) {
  readAll.mockImplementation(async (table: string) => {
    if (table === failing) throw new Error("Could not read the calendar. Please try again.");
    return [];
  });
}

beforeEach(() => {
  readAll.mockReset();
  process.env.CALENDAR_FEED_TOKEN = TOKEN;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ["calendar feed", feed],
  ["/api/export/ics", () => exportGET()],
])("%s", (_name, call) => {
  it("returns 200 with an .ics body when all three reads succeed", async () => {
    load(null);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(await res.text()).toContain("BEGIN:VCALENDAR");
    expect(readAll.mock.calls.map((c) => c[0]).sort()).toEqual(["event_exceptions", "event_overrides", "events"]);
  });

  it.each(["events", "event_overrides", "event_exceptions"])("returns a generic 500 when reading %s fails", async (table) => {
    load(table);
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
  });
});

describe("calendar feed token gate", () => {
  it("404s a wrong token before reading any data", async () => {
    load(null);
    const res = await feed("b".repeat(64));
    expect(res.status).toBe(404);
    expect(readAll).not.toHaveBeenCalled();
  });
});
