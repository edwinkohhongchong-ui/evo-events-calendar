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
    const puasa = by("Hari Raya Puasa");
    expect(puasa.status).toBe("changed");
    expect(puasa.planned.tentative).toBe(true);
    expect(puasa.changes).toEqual([{ field: "date", from: "2026-03-20", to: "2026-03-21" }]);
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

  const MAR = "Primary School Holidays (March)";
  const JUN = "Primary School Holidays (June)";

  it("unchanged when name and dates are identical", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea(MAR, "School Schedule", "2026-03-14", "2026-03-22"),
        sea(JUN, "School Schedule", "2026-05-30", "2026-06-28"),
      ],
    });
    expect(d.seasons.slice(0, 2).map((s) => s.status)).toEqual(["unchanged", "unchanged"]);
  });

  it("an existing row without the month in its name is not paired by name: month labels are never stripped", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea("Primary School Holidays", "School Schedule", "2026-03-14", "2026-03-22"),
        sea("Primary School Holidays", "School Schedule", "2026-05-30", "2026-06-28"),
      ],
    });
    expect(d.seasons.slice(0, 2).map((s) => s.status)).toEqual(["new", "new"]);
    expect(d.seasons[0].possibleDuplicates.map((x) => x.name)).toEqual(["Primary School Holidays"]);
  });

  it("changed when the same period moved; lists old vs new", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [
        sea(MAR, "School Schedule", "2026-03-14", "2026-03-22"),
        sea(JUN, "School Schedule", "2026-05-30", "2026-06-27"),
      ],
    });
    expect(d.seasons[1].status).toBe("changed");
    expect(d.seasons[1].changes).toEqual([{ field: "end_date", from: "2026-06-27", to: "2026-06-28" }]);
  });

  it("pairs a same-year period whose dates moved a little (no overlap), as a weak 'name-year' match", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea(MAR, "School Schedule", "2026-03-30", "2026-04-03")],
    });
    const changed = d.seasons.filter((s) => s.status === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0].matchKind).toBe("name-year");
    expect(changed[0].changes.map((c) => c.field)).toEqual(["start_date", "end_date"]);
  });

  it("does not pair a same-name row whose dates are far away (more than 45 days)", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea(MAR, "School Schedule", "2026-08-01", "2026-08-05")],
    });
    expect(d.seasons[0].status).toBe("new");
    expect(d.seasons[0].existing).toBeUndefined();
    expect(d.seasons[0].possibleDuplicates.map((x) => x.name)).toEqual([MAR]);
  });

  it("does not let two planned rows claim the same existing row", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea(MAR, "School Schedule", "2026-03-14", "2026-03-22")],
    });
    expect(d.seasons.map((s) => s.status)).toEqual(["unchanged", "new", "new"]);
  });

  it("an existing 'Poly Holidays (approx.)' is not paired with a coded document row (institution codes are identity)", () => {
    const d = planDiff(planned, {
      holidays: [],
      seasons: [sea("Poly Holidays (approx.)", "School Schedule", "2026-03-06", "2026-04-18")],
    });
    const poly = d.seasons.find((s) => s.planned.name.startsWith("Poly Holidays"))!;
    expect(poly.status).toBe("new");
    expect(poly.possibleDuplicates.map((x) => x.name)).toEqual(["Poly Holidays (approx.)"]);
  });

  it("drops only the tentative/approx qualifier when comparing names, and marks that match 'qualifier' (weak)", () => {
    const d = planDiff(plan(["Polytechnic", "SP:", "Vacation: 9 March 2026 - 19 April 2026"]), {
      holidays: [],
      seasons: [sea("Poly Holidays (SP) (approx.)", "School Schedule", "2026-03-06", "2026-04-18")],
    });
    expect(d.seasons[0]).toMatchObject({ status: "changed", matchKind: "qualifier" });
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

describe("match safety (wrong-row overwrite)", () => {
  const ps = (name: string, start: string, end: string, category: SeasonRow["category"] = "School Schedule") => ({
    kind: "season" as const,
    name,
    category,
    start_date: start,
    end_date: end,
    notes: "",
    key: `season|${name}|${category}|${start}|${end}`,
    source: { line: 1, text: "" },
    tentative: false,
    flags: [],
    invalid: false,
  });
  const sched = (...seasons: ReturnType<typeof ps>[]): PlannedSchedule => ({ docYear: 2026, holidays: [], seasons });

  it("two existing 'Poly Holidays' rows in one year: a December document range does not claim the September row", () => {
    const d = planDiff(sched(ps("Poly Holidays (NP, TP, NYP)", "2026-12-01", "2026-12-31")), {
      holidays: [],
      seasons: [
        sea("Poly Holidays (NP, TP, NYP)", "School Schedule", "2026-03-09", "2026-04-19"),
        sea("Poly Holidays (NP, TP, NYP)", "School Schedule", "2026-09-07", "2026-09-20"),
      ],
    });
    expect(d.seasons[0].status).toBe("new");
    expect(d.seasons[0].existing).toBeUndefined();
    expect(d.seasons[0].possibleDuplicates).toHaveLength(2);
  });

  it("several same-name candidates inside the shift window: no guess is made", () => {
    const d = planDiff(sched(ps("Poly Holidays (SP)", "2026-06-10", "2026-06-20")), {
      holidays: [],
      seasons: [
        sea("Poly Holidays (SP)", "School Schedule", "2026-05-20", "2026-05-30"),
        sea("Poly Holidays (SP)", "School Schedule", "2026-07-01", "2026-07-10"),
      ],
    });
    expect(d.seasons[0].status).toBe("new");
    expect(d.seasons[0].possibleDuplicates).toHaveLength(2);
  });

  it("an SP-only calendar row never matches an RP-only document row, even when the dates overlap", () => {
    const d = planDiff(sched(ps("Poly Holidays (RP)", "2026-03-09", "2026-04-19")), {
      holidays: [],
      seasons: [sea("Poly Holidays (SP)", "School Schedule", "2026-03-09", "2026-04-19")],
    });
    expect(d.seasons[0].status).toBe("new");
    expect(d.seasons[0].matchKind).toBeUndefined();
    expect(d.seasons[0].possibleDuplicates.map((x) => x.name)).toEqual(["Poly Holidays (SP)"]);
  });

  it("(March) never matches (June), even with overlapping dates", () => {
    const d = planDiff(sched(ps("Primary School Holidays (June)", "2026-05-30", "2026-06-28")), {
      holidays: [],
      seasons: [sea("Primary School Holidays (March)", "School Schedule", "2026-05-30", "2026-06-28")],
    });
    expect(d.seasons[0].status).toBe("new");
  });

  it("exact and overlapping same-name rows still match, with their kinds", () => {
    const d = planDiff(
      sched(ps("Poly Holidays (SP)", "2026-03-09", "2026-04-19"), ps("Poly Holidays (RP)", "2026-06-01", "2026-06-30")),
      {
        holidays: [],
        seasons: [
          sea("Poly Holidays (SP)", "School Schedule", "2026-03-09", "2026-04-19"),
          sea("Poly Holidays (RP)", "School Schedule", "2026-06-10", "2026-07-05"),
        ],
      }
    );
    expect(d.seasons.map((s) => [s.status, s.matchKind])).toEqual([
      ["unchanged", "exact"],
      ["changed", "overlap"],
    ]);
  });

  it("a long existing block and a short document stub (no shared start/end) is a weak 'name-year' match", () => {
    const d = planDiff(sched(ps("Year-End Holidays", "2026-01-01", "2026-01-03")), {
      holidays: [],
      seasons: [sea("Year-End Holidays", "School Schedule", "2025-11-22", "2026-01-04")],
    });
    expect(d.seasons[0].matchKind).toBe("name-year");
    // A shared end date alone is enough to call it the same row.
    const same = planDiff(sched(ps("Year-End Holidays", "2026-01-01", "2026-01-04")), {
      holidays: [],
      seasons: [sea("Year-End Holidays", "School Schedule", "2025-11-22", "2026-01-04")],
    });
    expect(same.seasons[0].matchKind).toBe("overlap");
  });

  it("identically named rows for two institutions with barely overlapping dates are only weak matches", () => {
    const d = planDiff(sched(ps("Term Break", "2026-06-01", "2026-06-30")), {
      holidays: [],
      seasons: [sea("Term Break", "School Schedule", "2026-06-25", "2026-07-20")],
    });
    expect(d.seasons[0].matchKind).toBe("name-year");
  });

  it("assigns globally: an earlier document row cannot steal an existing row that fits a later one better", () => {
    const d = planDiff(
      sched(ps("Holidays", "2026-06-01", "2026-06-20"), ps("Holidays", "2026-06-10", "2026-06-30")),
      {
        holidays: [],
        seasons: [
          sea("Holidays", "School Schedule", "2026-06-11", "2026-06-29"),
          sea("Holidays", "School Schedule", "2026-05-25", "2026-06-05"),
        ],
      }
    );
    expect(d.seasons[0].existing?.start_date).toBe("2026-05-25");
    expect(d.seasons[1].existing?.start_date).toBe("2026-06-11");
    expect(d.seasons[1].matchKind).toBe("overlap");
  });

  it("ties are broken deterministically, whatever the order of the existing rows", () => {
    const a = sea("Holidays", "School Schedule", "2026-06-01", "2026-06-10");
    const b = sea("Holidays", "School Schedule", "2026-06-01", "2026-06-10");
    const lo = a.id < b.id ? a : b;
    const pl = sched(ps("Holidays", "2026-06-01", "2026-06-12"));
    for (const order of [[a, b], [b, a]]) {
      const d = planDiff(pl, { holidays: [], seasons: order });
      expect(d.seasons[0].existing?.id).toBe(lo.id);
    }
  });

  it("holidays: same date is exact, a longer existing name is 'qualifier', a moved date is 'name-year' and bounded", () => {
    const p = plan(["Public Holidays", "Hari Raya Puasa: 21 March 2026", "Chinese New Year: 17 - 18 February 2026"]);
    const d = planDiff(p, {
      holidays: [
        hol("2026-03-20", "Hari Raya Puasa"),
        hol("2026-02-17", "Chinese New Year (Day 1)"),
        hol("2026-02-18", "Chinese New Year (Day 2) / Ash Wednesday"),
      ],
      seasons: [],
    });
    expect(d.holidays.map((h) => h.matchKind)).toEqual(["name-year", "exact", "qualifier"]);
    const far = planDiff(p, { holidays: [hol("2026-12-20", "Hari Raya Puasa")], seasons: [] });
    expect(far.holidays[0].status).toBe("new");
  });
});
