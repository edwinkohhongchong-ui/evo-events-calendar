import { afterEach, describe, expect, it, vi } from "vitest";
import { clampYearMonth, isValidDateStr, todayDate, todayStr } from "../dates";

describe("todayStr (Asia/Singapore)", () => {
  afterEach(() => vi.useRealTimers());

  it("rolls over to the next day after 16:00 UTC (00:00 SGT)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T20:00:00Z"));
    expect(todayStr()).toBe("2026-10-02");
  });

  it("matches the UTC date during the SGT daytime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    expect(todayStr()).toBe("2026-10-01");
  });

  it("todayDate has the Singapore calendar day's year/month/day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T17:00:00Z"));
    const d = todayDate();
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 1, 1]);
  });
});

describe("isValidDateStr", () => {
  it("accepts real dates", () => {
    expect(isValidDateStr("2026-10-01")).toBe(true);
    expect(isValidDateStr("2028-02-29")).toBe(true);
  });
  it("rejects malformed or impossible dates", () => {
    for (const s of ["abc", "2026-2-1", "2026-02-30", "2026-13-01", "2027-02-29", "2026-10-01x", "", null, 5]) {
      expect(isValidDateStr(s)).toBe(false);
    }
  });
});

describe("clampYearMonth", () => {
  it("clamps out-of-range values", () => {
    expect(clampYearMonth("9999", "13")).toEqual({ year: 2100, month: 12 });
    expect(clampYearMonth("1", "-4")).toEqual({ year: 2000, month: 1 });
  });
  it("passes valid values through", () => {
    expect(clampYearMonth("2026", "10")).toEqual({ year: 2026, month: 10 });
  });
  it("falls back to today for missing/garbage input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T20:00:00Z"));
    expect(clampYearMonth(undefined, "abc")).toEqual({ year: 2026, month: 10 });
    vi.useRealTimers();
  });
});
