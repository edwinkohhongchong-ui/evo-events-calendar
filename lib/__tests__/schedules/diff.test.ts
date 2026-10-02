import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { HolidayRow, SeasonRow } from "../../types";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { classifySchedule, PlannedSchedule } from "../../schedules/classify";
import { planDiff } from "../../schedules/diff";

let n = 0;
const hol = (date: string, name: string, type: HolidayRow["type"] = "National (SG Public Holiday)"): HolidayRow => ({
  id: `h${++n}`,
  holiday_date: date,
  name,
  type,
});
const sea = (name: string, category: SeasonRow["category"], start: string, end: string, notes: string | null = ""): SeasonRow => ({
  id: `s${++n}`,
  name,
  category,
  start_date: start,
  end_date: end,
  notes,
  color: null,
});

const plan = (rows: string[]): PlannedSchedule =>
  classifySchedule(parseScheduleLines(["Education Schedules 2026", ...rows]));

describe("holiday diff", () => {
  const planned = plan([
    "Public Holidays",
    "Labour Day: 1 May 2026",
    "Hari Raya Puasa: 21 March 2026 (subject to confirmation)",
    "Vesak Day: 31 May 2026 (this is a Sunday, 1 June 2026 will be PH)",
    "Good Friday: 3 April 2026",
  ]);

  it("classifies new, changed and unchanged", () => {
    const d = planDiff(planned, {
      holidays: [
        hol("2026-05-01", "Labour Day"),
        hol("2026-03-20", "Hari Raya Puasa", "National (SG Public Holiday, provisional)"),
        hol("2026-05-31", "Vesak Day"),
        hol("2026-06-01", "Vesak Day (In-Lieu)"),
      ],
      seasons: [],
    });
    const by = (name: string) => d.holidays.find((h) => h.planned.name === name)!;
    expect(by("Labour Day").status).toBe("unchanged");
    expect(by("Vesak Day").status).toBe("unchanged");
    expect(by("Vesak Day (In-Lieu)").status).toBe("unchanged");
    expect(by("Good Friday").status).toBe("new");
    const puasa = by("Hari Raya Puasa (tentative)");
    expect(puasa.status).toBe("changed");
    expect(puasa.changes).toEqual([
      { field: "date", from: "2026-03-20", to: "2026-03-21" },
      { field: "name", from: "Hari Raya Puasa", to: "Hari Raya Puasa (tentative)" },
    ]);
    expect(d.summary.holidays).toEqual({ new: 1, changed: 1, unchanged: 3 });
  });

  it("an in-lieu day never matches the holiday itself", () => {
    const d = planDiff(planned, { holidays: [hol("2026-06-01", "Vesak Day (In-Lieu)")], seasons: [] });
    expect(d.holidays.find((h) => h.planned.date === "2026-05-31")?.status).toBe("new");
    expect(d.holidays.find((h) => h.planned.date === "2026-06-01")?.status).toBe("unchanged");
  });

  it("matches an existing name with an extra qualifier", () => {
    const p = plan(["Public Holidays", "Chinese New Year: 17 - 18 February 2026"]);
    const d = planDiff(p, {
      holidays: [hol("2026-02-17", "Chinese New Year (Day 1)"), hol("2026-02-18", "Chinese New Year (Day 2) / Ash Wednesday")],
      seasons: [],
    });
    expect(d.holidays.map((h) => h.status)).toEqual(["unchanged", "changed"]);
    expect(d.holidays[1].changes.map((c) => c.field)).toEqual(["name"]);
  });

  it("reports a different-named holiday on the same date as a possible duplicate", () => {
    const d = planDiff(planned, { holidays: [hol("2026-04-03", "Holy Friday")], seasons: [] });
    const gf = d.holidays.find((h) => h.planned.name === "Good Friday")!;
    expect(gf.status).toBe("new");
    expect(gf.possibleDuplicates.map((x) => x.name)).toEqual(["Holy Friday"]);
  });

  it("lists in-scope existing holidays the document never mentions, but not other types or years", () => {
    const d = planDiff(planned, {
      holidays: [
        hol("2026-08-09", "National Day"),
        hol("2026-02-14", "Valentine's Day", "International Observance"),
        hol("2025-12-25", "Christmas Day"),
      ],
      seasons: [],
    });
    expect(d.missingFromDocument.holidays.map((h) => h.name)).toEqual(["National Day"]);
  });
});

describe("season diff", () => {
  const planned = plan([
    "Primary School",
    "School Holidays",
    "14 March 2026 - 22 March 2026",
    "30 May 2026 - 28 June 2026",
    "Polytechnic",
    "NP, TP, NYP:",
    "Vacation: 9 March 2026 - 19 April 2026",
  ]);

  it("unchanged when name and dates are identical", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea("Primary School Holidays", "School Schedule", "2026-03-14", "2026-03-22"),
        sea("Primary School Holidays", "School Schedule", "2026-05-30", "2026-06-28"),
      ],
    });
    expect(d.seasons.slice(0, 2).map((s) => s.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("changed when the same period moved; lists old vs new", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea("Primary School Holidays", "School Schedule", "2026-03-14", "2026-03-22"),
        sea("Primary School Holidays", "School Schedule", "2026-05-30", "2026-06-27"),
      ],
    });
    expect(d.seasons[1].status).toBe("changed");
    expect(d.seasons[1].changes).toEqual([{ field: "end_date", from: "2026-06-27", to: "2026-06-28" }]);
  });

  it("pairs a same-year period with entirely different dates (no overlap)", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea("Primary School Holidays", "School Schedule", "2026-08-01", "2026-08-05")],
    });
    const changed = d.seasons.filter((s) => s.status === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0].changes.map((c) => c.field)).toEqual(["start_date", "end_date"]);
  });

  it("does not let two planned rows claim the same existing row", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea("Primary School Holidays", "School Schedule", "2026-03-14", "2026-03-22")],
    });
    expect(d.seasons.map((s) => s.status)).toEqual(["unchanged", "new", "new"]);
  });

  it("recognises 'Poly Holidays (approx.)' as the same season with different dates", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea("Poly Holidays (approx.)", "School Schedule", "2026-03-06", "2026-04-18")],
    });
    const poly = d.seasons.find((s) => s.planned.name.startsWith("Poly Holidays"))!;
    expect(poly.status).toBe("changed");
    expect(poly.existing?.name).toBe("Poly Holidays (approx.)");
  });

  it("suggests possible duplicates for new rows that overlap an existing differently-named season", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea("MOE March School Holidays", "School Schedule", "2026-03-14", "2026-03-22")],
    });
    expect(d.seasons[0].status).toBe("new");
    expect(d.seasons[0].possibleDuplicates.map((s) => s.name)).toEqual(["MOE March School Holidays"]);
  });

  it("notes that differ do not make a row changed", () => {
    const d = planDiff(plan(["Secondary School", "N Level (tentative)", "Oral: 13 July 2026"]), {
      holidays: [],
      seasons: [sea("N Level Oral", "Exam Period", "2026-07-13", "2026-07-13", "")],
    });
    expect(d.seasons[0]).toMatchObject({ status: "unchanged", notesDiffer: true });
  });

  it("existing school/exam seasons in the year that the document omits are reported, never deleted", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea("MOE School Term 1", "School Schedule", "2026-01-06", "2026-03-13"),
        sea("Growth Cycle 1", "Ministry Season", "2026-01-05", "2026-03-01"),
        sea("Old Term", "School Schedule", "2025-01-06", "2025-03-13"),
      ],
    });
    expect(d.missingFromDocument.seasons.map((s) => s.name)).toEqual(["MOE School Term 1"]);
    expect(d.summary.missingSeasons).toBe(1);
  });

  it("is a pure function: running it twice on a real doc gives identical output", () => {
    const real = classifySchedule(
      parseScheduleLines(readFileSync(join(__dirname, "../fixtures/education-schedules-2026.txt"), "utf8").split("\n"))
    );
    const existing = { holidays: [], seasons: [sea("Poly Examinations (approx.)", "Exam Period", "2026-02-16", "2026-02-27")] };
    const a = planDiff(real, existing);
    expect(planDiff(real, existing)).toEqual(a);
    expect(a.summary.seasons.new + a.summary.seasons.changed + a.summary.seasons.unchanged).toBe(82);
    expect(a.summary.holidays.new).toBe(14);
  });
});
