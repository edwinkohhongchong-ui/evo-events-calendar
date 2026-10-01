import { describe, it, expect } from "vitest";
import { parseDateStr, toDateStr, formatDateDisplay, formatEventTime, formatEventTimeRange } from "../dates";
import { timeStrToMinutes, minutesToTimeStr, computeEndTime, computeDuration, endsNextDay } from "../timeMath";
import { computeSpanDays } from "../eventSpan";

describe("dates (timezone safety)", () => {
  it("round-trips every day of 2026 and 2028 (leap) with no off-by-one", () => {
    for (const y of [2026, 2028]) {
      for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
        const s = `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        expect(toDateStr(parseDateStr(s))).toBe(s);
      }
    }
  });
  it("parses date-only as local midnight, not UTC", () => {
    const d = parseDateStr("2026-10-02");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 2, 0]);
  });
  it("formats display strings", () => {
    expect(formatDateDisplay("2026-01-04")).toBe("4 Jan 2026");
    expect(formatDateDisplay("2028-02-29")).toBe("29 Feb 2028");
  });
  it("formats times incl. midnight and noon", () => {
    expect(formatEventTime(null)).toBeNull();
    expect(formatEventTime("")).toBeNull();
    expect(formatEventTime("00:00:00")).toBe("12:00 AM");
    expect(formatEventTime("12:05:00")).toBe("12:05 PM");
    expect(formatEventTime("23:59")).toBe("11:59 PM");
  });
  it("formats ranges", () => {
    expect(formatEventTimeRange("15:00:00", "16:30:00")).toBe("3:00–4:30 PM");
    expect(formatEventTimeRange("23:00:00", "02:00:00")).toBe("11:00 PM–2:00 AM");
    expect(formatEventTimeRange("09:00:00", null)).toBe("9:00 AM");
    expect(formatEventTimeRange(null, "10:00:00")).toBeNull();
    expect(formatEventTimeRange("11:00:00", "13:00:00")).toBe("11:00 AM–1:00 PM");
  });
});

describe("timeMath", () => {
  it("converts both ways", () => {
    expect(timeStrToMinutes("09:30:00")).toBe(570);
    expect(minutesToTimeStr(570)).toBe("09:30");
  });
  it("wraps past midnight and handles negatives", () => {
    expect(minutesToTimeStr(1440)).toBe("00:00");
    expect(minutesToTimeStr(-30)).toBe("23:30");
    expect(computeEndTime("23:00:00", 120)).toBe("01:00");
    expect(computeEndTime("10:00", 0)).toBe("10:00");
  });
  it("computes duration across midnight", () => {
    expect(computeDuration("22:00", "01:00")).toBe(180);
    expect(computeDuration("09:00", "10:30")).toBe(90);
  });
  it("equal start and end is 0 duration, not 24h (documented behaviour)", () => {
    expect(computeDuration("09:00", "09:00")).toBe(0);
    expect(endsNextDay("09:00", "09:00")).toBe(false);
  });
  it("endsNextDay", () => {
    expect(endsNextDay("22:00", "01:00")).toBe(true);
    expect(endsNextDay("09:00", "10:00")).toBe(false);
  });
});

describe("computeSpanDays", () => {
  it("0 for null end", () => expect(computeSpanDays({ event_date: "2026-03-01", end_date: null })).toBe(0));
  it("counts across month and leap day", () => {
    expect(computeSpanDays({ event_date: "2028-02-27", end_date: "2028-03-01" })).toBe(3);
    expect(computeSpanDays({ event_date: "2026-12-30", end_date: "2027-01-02" })).toBe(3);
  });
  it("end == start is 0", () => expect(computeSpanDays({ event_date: "2026-03-01", end_date: "2026-03-01" })).toBe(0));
});
