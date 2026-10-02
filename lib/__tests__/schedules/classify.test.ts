import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { classifySchedule, holidayMonthLabel } from "../../schedules/classify";

const real = classifySchedule(
  parseScheduleLines(readFileSync(join(__dirname, "../fixtures/education-schedules-2026.txt"), "utf8").split("\n"))
);
const plan = (rows: string[]) => classifySchedule(parseScheduleLines(["Education Schedules 2026", ...rows]));

describe("holidayMonthLabel (decision d)", () => {
  it("uses the start month for a range inside one month", () => {
    expect(holidayMonthLabel("2026-03-14", "2026-03-22")).toBe("(March)");
    expect(holidayMonthLabel("2026-09-05", "2026-09-13")).toBe("(September)");
  });
  it("ignores a month that holds fewer than 3 days of the range", () => {
    expect(holidayMonthLabel("2026-05-30", "2026-06-28")).toBe("(June)"); // 2 days in May
    expect(holidayMonthLabel("2026-11-28", "2027-01-02")).toBe("(November-December)"); // Nov has 3
    expect(holidayMonthLabel("2026-11-29", "2027-01-02")).toBe("(December)"); // Nov has 2
  });
  it("names both months when each holds 3+ days, across a year end too", () => {
    expect(holidayMonthLabel("2026-11-21", "2027-01-02")).toBe("(November-December)");
    expect(holidayMonthLabel("2026-06-20", "2026-07-10")).toBe("(June-July)");
  });
  it("falls back to the month with most days for a very short range", () => {
    expect(holidayMonthLabel("2026-03-31", "2026-04-01")).toBe("(March)"); // 1 vs 1: earlier wins
    expect(holidayMonthLabel("2026-03-30", "2026-04-02")).toBe("(March)"); // 2 vs 2: earlier wins
    expect(holidayMonthLabel("2026-03-30", "2026-04-03")).toBe("(April)"); // 2 vs 3, only April qualifies
    expect(holidayMonthLabel("2026-03-29", "2026-04-04")).toBe("(March-April)"); // 3 and 4
  });
  it("is deterministic and handles a single day", () => {
    expect(holidayMonthLabel("2026-03-01", "2026-03-01")).toBe("(March)");
    expect(holidayMonthLabel("2026-03-14", "2026-03-22")).toBe(holidayMonthLabel("2026-03-14", "2026-03-22"));
  });
});

describe("classify decisions", () => {
  it("(a) tentative holidays keep the plain name; only the type marks them", () => {
    const p = plan(["Public Holidays", "Hari Raya Puasa: 21 March 2026 (subject to confirmation)"]);
    expect(p.holidays).toHaveLength(1);
    expect(p.holidays[0]).toMatchObject({
      name: "Hari Raya Puasa",
      type: "National (SG Public Holiday, provisional)",
      tentative: true,
    });
    expect(p.holidays[0].flags.map((f) => f.code)).toContain("tentative");
    expect(p.holidays[0].key).toBe("holiday|hari raya puasa|2026-03-21|2026-03-21");
  });

  it("(b) not-published SP/RP rows apply to both institutions and keep the flag", () => {
    const rows = real.seasons.filter((s) => s.flags.some((f) => f.code === "not-published"));
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.name).toMatch(/\(SP, RP\)$/);
      expect(r.invalid).toBe(false);
      expect(r.flags.find((f) => f.code === "not-published")?.message).toMatch(/SP and RP/);
    }
  });

  it("(c) mid-term windows are tentative Exam Periods that default to unticked", () => {
    const mids = real.seasons.filter((s) => s.name.endsWith("Mid-terms"));
    expect(mids).toHaveLength(5);
    for (const m of mids) {
      expect(m).toMatchObject({ category: "Exam Period", tentative: true, defaultSelected: false });
    }
    // Everything else leaves defaultSelected unset.
    expect(real.seasons.filter((s) => !s.name.endsWith("Mid-terms")).every((s) => s.defaultSelected === undefined)).toBe(true);
  });

  it("(d) school holidays carry the month for Primary, Secondary and JC", () => {
    const names = (prefix: string) => real.seasons.filter((s) => s.name.startsWith(prefix)).map((s) => s.name);
    for (const prefix of ["Primary School Holidays", "Secondary School Holidays", "JC Holidays"]) {
      expect(names(prefix)).toEqual([
        `${prefix} (March)`,
        `${prefix} (June)`,
        `${prefix} (September)`,
        `${prefix} (November-December)`,
      ]);
    }
    // Poly holidays are not month-named.
    expect(real.seasons.some((s) => /^Poly Holidays \((?:March|June)/.test(s.name))).toBe(false);
  });

  it("(e) the observed day keeps the (In-Lieu) suffix", () => {
    const names = real.holidays.map((h) => h.name);
    expect(names).toContain("Vesak Day (In-Lieu)");
    expect(names.some((n) => /observed/i.test(n))).toBe(false);
  });

  it("(f) the A Level end-before-start typo stays an error row that cannot apply as-is", () => {
    const bad = real.seasons.filter((s) => s.invalid);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ name: "A Level Written", start_date: "2026-10-14", end_date: "2025-10-21" });
    expect(bad[0].flags.some((f) => f.code === "end-before-start" && f.severity === "error")).toBe(true);
  });
});
