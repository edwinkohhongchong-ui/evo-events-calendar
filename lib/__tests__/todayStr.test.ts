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

describe("URL input hardening (/day/abc, ?month=13 style)", () => {
  it("isValidDateStr rejects path-ish and padded junk", () => {
    for (const s of ["abc", "2026-10-1", " 2026-10-01", "2026-10-01\n", "2026/10/01", "٢٠٢٦-١٠-٠١", "2026-00-10", "2026-10-00", "0000-00-00", [], {}, undefined]) {
      expect(isValidDateStr(s)).toBe(false);
    }
  });
  it("isValidDateStr handles leap-day boundaries", () => {
    expect(isValidDateStr("2100-02-29")).toBe(false); // 2100 is not a leap year
    expect(isValidDateStr("2000-02-29")).toBe(true);
  });
  it("clampYearMonth truncates fractions and clamps month 13 / year bounds", () => {
    expect(clampYearMonth("2026.9", "10.9")).toEqual({ year: 2026, month: 10 });
    expect(clampYearMonth("1999", "13")).toEqual({ year: 2000, month: 12 });
    expect(clampYearMonth("2101", "1")).toEqual({ year: 2100, month: 1 });
    expect(clampYearMonth("Infinity", "-Infinity")).toEqual(clampYearMonth(undefined, undefined));
  });
  it("clampYearMonth treats 0 and non-scalar input as missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    expect(clampYearMonth("0", "0")).toEqual({ year: 2026, month: 10 });
    expect(clampYearMonth(["2027"], { a: 1 })).toEqual({ year: 2027, month: 10 });
    vi.useRealTimers();
  });
});
