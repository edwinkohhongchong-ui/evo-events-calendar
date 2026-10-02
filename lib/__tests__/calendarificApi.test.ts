import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCalendarificLoader, fetchCalendarificYear, nationalHolidays } from "../calendarificApi";
import { SG_2026 } from "./fixtures/calendarificSg2026";

const body = (year: number, list = SG_2026) => ({
  response: {
    holidays: list.map((h) => ({
      name: h.name,
      description: h.description,
      type: h.type,
      date: { iso: h.date, datetime: { year } },
    })),
  },
});
const ok = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });

beforeEach(() => vi.stubEnv("CALENDARIFIC_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchCalendarificYear", () => {
  it("returns holidays on success", async () => {
    const fetchMock = vi.fn(async () => ok(body(2026)));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchCalendarificYear(2026);
    expect(r).toMatchObject({ ok: true, year: 2026, totalFromApi: SG_2026.length });
    expect(r.ok && r.holidays[0]).toEqual({ date: "2026-01-01", name: "New Year's Day", description: "New Year's Day in Singapore", type: ["National holiday"] });
    expect(String((fetchMock.mock.calls as unknown[][])[0][0])).toContain("country=SG&year=2026");
  });

  it("no key: fails without calling the network", async () => {
    vi.stubEnv("CALENDARIFIC_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, reason: "no-key", cause: "no-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429 is rate-limited; 401 and 500 are unavailable with hand-written messages", async () => {
    vi.stubGlobal("fetch", async () => ok({}, 429));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, reason: "rate-limited", cause: "rate-limited" });
    vi.stubGlobal("fetch", async () => ok({}, 401));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, reason: "unavailable", cause: "rejected-key" });
    vi.stubGlobal("fetch", async () => ok({}, 503));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, reason: "unavailable", cause: "http", status: 503 });
  });

  it("a network error is unavailable and never leaks the raw error or the key", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("getaddrinfo ENOTFOUND calendarific.com?api_key=test-key");
    });
    const r = await fetchCalendarificYear(2026);
    expect(r).toMatchObject({ ok: false, reason: "unavailable", cause: "network" });
    expect(JSON.stringify(r)).not.toMatch(/ENOTFOUND|test-key/);
  });

  it("times out: aborts the request and reports unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))
    );
    const pending = fetchCalendarificYear(2026, { timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toMatchObject({ ok: false, reason: "unavailable", cause: "timeout" });
  });

  it("bad JSON or an unexpected shape is unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>oops</html>", { status: 200 }));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, reason: "unavailable" });
    vi.stubGlobal("fetch", async () => ok({ response: { holidays: "nope" } }));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, cause: "bad-response" });
  });

  it("refuses a different year than requested, and skips malformed entries individually", async () => {
    vi.stubGlobal("fetch", async () => ok(body(2025)));
    expect(await fetchCalendarificYear(2026)).toMatchObject({ ok: false, cause: "wrong-year" });
    vi.stubGlobal("fetch", async () => ok({ response: { holidays: [{ name: "Broken" }, { name: "Fine", date: { iso: "2026-05-01" } }] } }));
    const r = await fetchCalendarificYear(2026);
    expect(r.ok && r.holidays.map((h) => h.name)).toEqual(["Fine"]);
    expect(r.ok && r.totalFromApi).toBe(2);
  });
});

describe("nationalHolidays / loader", () => {
  it("keeps only National holiday types", () => {
    const names = nationalHolidays(SG_2026).map((h) => h.name);
    expect(names).toContain("Christmas Day");
    expect(names).not.toContain("Valentine's Day");
    expect(names).not.toContain("Ash Wednesday");
  });

  it("looks each year up once", async () => {
    const fetchMock = vi.fn(async () => ok(body(2026)));
    vi.stubGlobal("fetch", fetchMock);
    const load = createCalendarificLoader();
    await Promise.all([load(2026), load(2026)]);
    await load(2026);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
