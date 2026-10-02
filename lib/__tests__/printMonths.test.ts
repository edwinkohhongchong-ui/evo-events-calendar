import { describe, it, expect } from "vitest";
import {
  MAX_PRINT_MONTHS,
  monthKeysForYear,
  monthKeysFrom,
  monthLabel,
  parseMonthsParam,
  printHref,
  sortMonthKeys,
  summarizeMonthKeys,
} from "../printMonths";

describe("parseMonthsParam", () => {
  it("parses, de-duplicates and sorts", () => {
    const r = parseMonthsParam("2026-11,2026-10,2026-11,2025-12");
    expect(r.ok && r.months.map((m) => m.key)).toEqual(["2025-12", "2026-10", "2026-11"]);
    expect(r.ok && r.months[1]).toEqual({ key: "2026-10", year: 2026, month: 10 });
  });
  it("rejects empty / missing", () => {
    expect(parseMonthsParam(undefined).ok).toBe(false);
    expect(parseMonthsParam("").ok).toBe(false);
    expect(parseMonthsParam("  ").ok).toBe(false);
  });
  it.each(["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "abc", "2026-10,", "1999-05", "2101-01"])(
    "rejects %s",
    (bad) => expect(parseMonthsParam(bad).ok).toBe(false)
  );
  it("accepts the year bounds", () => {
    expect(parseMonthsParam("2000-01,2100-12").ok).toBe(true);
  });
  it("enforces the 24 month cap", () => {
    const keys = [...monthKeysForYear(2026), ...monthKeysForYear(2027)];
    expect(keys).toHaveLength(MAX_PRINT_MONTHS);
    expect(parseMonthsParam(keys.join(",")).ok).toBe(true);
    expect(parseMonthsParam([...keys, "2028-01"].join(",")).ok).toBe(false);
  });
  it("joins a repeated query param", () => {
    const r = parseMonthsParam(["2026-02", "2026-01"]);
    expect(r.ok && r.months.map((m) => m.key)).toEqual(["2026-01", "2026-02"]);
  });
});

describe("month key builders", () => {
  it("whole year is 12 sorted keys", () => {
    const k = monthKeysForYear(2026);
    expect(k).toHaveLength(12);
    expect(k[0]).toBe("2026-01");
    expect(k[11]).toBe("2026-12");
  });
  it("monthKeysFrom rolls over the year", () => {
    expect(monthKeysFrom("2026-11-15", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthKeysFrom("2026-10-02", 1)).toEqual(["2026-10"]);
  });
  it("sortMonthKeys drops invalid and duplicates", () => {
    expect(sortMonthKeys(["2026-12", "bad", "2026-02", "2026-12"])).toEqual(["2026-02", "2026-12"]);
  });
});

describe("summaries", () => {
  it("labels and joins chronologically", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(summarizeMonthKeys(["2026-11", "2026-10"])).toBe("Oct 2026, Nov 2026");
    expect(summarizeMonthKeys([])).toBe("");
  });
  it("builds the print href", () => {
    expect(printHref(["2026-11", "2026-10"])).toBe("/export/print?months=2026-10,2026-11");
  });
});
