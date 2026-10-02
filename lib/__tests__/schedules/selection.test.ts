import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { HolidayRow, SeasonRow } from "../../types";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { classifySchedule } from "../../schedules/classify";
import { planDiff } from "../../schedules/diff";
import { buildSchedulePlan, initialSelected, type SchedulePlan } from "../../schedules/planRows";
import {
  blockingProblems,
  buildSelection,
  canTick,
  copyListText,
  defaultSelection,
  draftFromRow,
  confirmMessage,
  planCounts,
  selectAllNew,
  selectionCounts,
  weakOverwrites,
} from "../../schedules/selection";
import { validateSelection } from "../../schedules/applyValidation";

const parsed = parseScheduleLines(readFileSync(join(__dirname, "../fixtures/education-schedules-2026.txt"), "utf8").split("\n"));
const classified = classifySchedule(parsed);

const H1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const H_AT = "2026-02-01T09:00:00.123456+00:00";
const S_AT = "2026-02-02T09:00:00+00:00";
const existingHoliday: HolidayRow = {
  id: H1,
  holiday_date: "2026-03-20",
  name: "Hari Raya Puasa",
  type: "National (SG Public Holiday, provisional)",
  updated_at: H_AT,
};
const existingSeason: SeasonRow = {
  id: S1,
  name: "Primary School Holidays (March)",
  category: "School Schedule",
  start_date: "2026-03-14",
  end_date: "2026-03-21",
  notes: "Keep me",
  color: "teal",
  updated_at: S_AT,
};
const plan: SchedulePlan = buildSchedulePlan(parsed, planDiff(classified, { holidays: [existingHoliday], seasons: [existingSeason] }));
const all = [...plan.holidays, ...plan.seasons];
const find = (name: string, start?: string) => all.find((r) => r.name === name && (!start || r.start === start))!;

describe("plan rows", () => {
  it("is JSON-safe and round-trips unchanged", () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    expect(JSON.stringify(plan)).not.toMatch(/\bundefined\b/);
  });

  it("carries the matched existing row for updates and keeps its notes when the document has none", () => {
    const march = find("Primary School Holidays (March)");
    expect(march).toMatchObject({ status: "changed", existingId: S1, notes: "Keep me", matchKind: "overlap" });
    expect(march.existing?.updatedAt).toBe(S_AT);
    expect(march.changes).toEqual([{ field: "end_date", from: "2026-03-21", to: "2026-03-22" }]);
    const puasa = find("Hari Raya Puasa");
    expect(puasa).toMatchObject({ status: "changed", existingId: H1, tentative: true, matchKind: "name-year" });
    expect(puasa.existing?.updatedAt).toBe(H_AT);
    expect(puasa.changes).toEqual([{ field: "date", from: "2026-03-20", to: "2026-03-21" }]);
  });
});

describe("default selection rules", () => {
  it("ticks new/changed rows without errors, never unchanged, errors or mid-terms", () => {
    const picked = defaultSelection(plan);
    for (const r of all) {
      const expected = r.status !== "unchanged" && !r.invalid && !r.name.endsWith("Mid-terms") && r.name !== "Hari Raya Puasa";
      expect(picked.has(r.rowId), `${r.name} ${r.start}`).toBe(expected);
      expect(r.defaultSelected).toBe(expected);
    }
    expect(find("A Level Written", "2026-10-14").defaultSelected).toBe(false);
    expect(find("NTU Mid-terms").defaultSelected).toBe(false);
    expect(find("Christmas Day").defaultSelected).toBe(true);
    expect(picked.size).toBe(all.length - 1 - 5 - 1);
  });

  it("a row matched by name only starts unticked and carries a plain-language flag", () => {
    const puasa = find("Hari Raya Puasa");
    expect(puasa.defaultSelected).toBe(false);
    expect(defaultSelection(plan).has(puasa.rowId)).toBe(false);
    expect(puasa.flags.find((f) => f.code === "weak-match")).toMatchObject({
      severity: "warn",
      message: "Matched by name only. Check this is the same row before applying.",
    });
    // It can still be ticked by hand (it is not an error), and then sends its lock token.
    expect(canTick(puasa, undefined, 2026)).toBe(true);
    expect(buildSelection(plan, new Set([puasa.rowId]), {})[0]).toMatchObject({ op: "update", id: H1, expectedUpdatedAt: H_AT });
    // An exact/overlap match carries no such flag and stays ticked.
    const march = find("Primary School Holidays (March)");
    expect(march.defaultSelected).toBe(true);
    expect(march.flags.some((f) => f.code === "weak-match")).toBe(false);
  });

  it("initialSelected: unchanged is never ticked; only exact/overlap matches are ever pre-ticked", () => {
    expect(initialSelected({ status: "changed", invalid: false, matchKind: "exact" })).toBe(true);
    expect(initialSelected({ status: "changed", invalid: false, matchKind: "overlap" })).toBe(true);
    expect(initialSelected({ status: "changed", invalid: false, matchKind: "name-year" })).toBe(false);
    expect(initialSelected({ status: "changed", invalid: false, matchKind: "qualifier" })).toBe(false);
    expect(initialSelected({ status: "new", invalid: false, matchKind: null })).toBe(true);
    expect(initialSelected({ status: "unchanged", invalid: false })).toBe(false);
    expect(initialSelected({ status: "changed", invalid: false })).toBe(true);
    expect(initialSelected({ status: "new", invalid: true })).toBe(false);
    expect(initialSelected({ status: "new", invalid: false }, false)).toBe(false);
  });

  it("selectAllNew ignores changed rows, errors and edits that break a row", () => {
    const ids = selectAllNew(plan, {});
    expect(ids.has(find("Christmas Day").rowId)).toBe(true);
    expect(ids.has(find("Hari Raya Puasa").rowId)).toBe(false); // changed
    expect(ids.has(find("A Level Written", "2026-10-14").rowId)).toBe(false);
    const x = find("Christmas Day");
    expect(selectAllNew(plan, { [x.rowId]: { ...draftFromRow(x), start: "" } }).has(x.rowId)).toBe(false);
  });

  it("counts", () => {
    const c = planCounts(plan);
    expect(c.new + c.changed + c.unchanged).toBe(all.length);
    expect(c.changed).toBe(2);
    expect(c.ignored).toBe(3);
    expect(c.needAttention).toBeGreaterThan(0);
  });
});

describe("error rows (decision f)", () => {
  const bad = find("A Level Written", "2026-10-14");
  it("cannot be ticked until the date is fixed in the editor", () => {
    expect(bad.invalid).toBe(true);
    expect(canTick(bad, undefined, 2026)).toBe(false);
    expect(blockingProblems(bad, undefined, 2026)[0]).toMatch(/before the start/);
    const sel = new Set([bad.rowId]);
    expect(buildSelection(plan, sel, {})).toEqual([]);

    const stillBad = { ...draftFromRow(bad), name: "Renamed" };
    expect(canTick(bad, stillBad, 2026)).toBe(false);
    expect(blockingProblems(bad, stillBad, 2026)[0]).toMatch(/end date is before/);

    const fixed = { ...draftFromRow(bad), end: "2026-10-21" };
    expect(blockingProblems(bad, fixed, 2026)).toEqual([]);
    expect(buildSelection(plan, sel, { [bad.rowId]: fixed })).toHaveLength(1);
  });

  it("an edit that moves a date far from the document year is still blocked", () => {
    const far = { ...draftFromRow(bad), start: "2023-10-14", end: "2023-10-21" };
    expect(blockingProblems(bad, far, 2026)[0]).toMatch(/more than a year/);
  });
});

describe("buildSelection", () => {
  it("maps matched rows to update and others to create, using edited values, and passes server validation", () => {
    const march = find("Primary School Holidays (March)");
    const xmas = find("Christmas Day");
    const sel = buildSelection(plan, new Set([march.rowId, xmas.rowId]), {
      [xmas.rowId]: { ...draftFromRow(xmas), name: "Christmas Day (edited)" },
    });
    expect(sel).toEqual([
      { kind: "holiday", op: "create", values: { name: "Christmas Day (edited)", category: "National (SG Public Holiday)", start: "2026-12-25", end: "2026-12-25", notes: "" } },
      { kind: "season", op: "update", id: S1, expectedUpdatedAt: S_AT, values: { name: "Primary School Holidays (March)", category: "School Schedule", start: "2026-03-14", end: "2026-03-22", notes: "Keep me" } },
    ]);
    expect(selectionCounts(sel)).toEqual({ add: 1, update: 1 });
    expect(validateSelection(sel).ok).toBe(true);
  });

  it("the default selection of the real document passes server validation in full", () => {
    const sel = buildSelection(plan, defaultSelection(plan), {});
    const r = validateSelection(sel);
    expect(r.ok).toBe(true);
    expect(sel.length).toBeLessThanOrEqual(300);
  });
});

describe("copyListText", () => {
  it("strips control, zero-width and bidi characters from names", () => {
    const row = find("Christmas Day");
    const text = copyListText(plan, new Set([row.rowId]), { [row.rowId]: { ...draftFromRow(row), name: "Xmas\u202e\u200b Day\u0007" } });
    expect(text).toBe("Holidays | Xmas Day | 2026-12-25 | ");
  });

  it("writes one line per ticked row with Section | Name | dates | tentative", () => {
    const text = copyListText(plan, new Set([find("Hari Raya Puasa").rowId, find("PSLE Oral").rowId, find("Christmas Day").rowId]), {});
    expect(text.split("\n")).toEqual([
      "Holidays | Hari Raya Puasa | 2026-03-21 | tentative",
      "Holidays | Christmas Day | 2026-12-25 | ",
      "Seasons | PSLE Oral | 2026-08-12 - 2026-08-13 | tentative",
    ]);
  });
});

describe("per-row problems that would reject the whole Apply", () => {
  const march = find("Primary School Holidays (March)");
  const long = "x".repeat(499);

  it("an update whose merged notes exceed 500 characters cannot be ticked until edited", () => {
    const row = { ...march, notes: `${long}\nmore` };
    expect(blockingProblems(row, undefined, 2026)).toContain("Notes would be longer than 500 characters; edit the notes");
    expect(canTick(row, undefined, 2026)).toBe(false);
    expect(buildSelection({ ...plan, seasons: [row] }, new Set([row.rowId]), {})).toEqual([]);
    const fixed = { ...draftFromRow(row), notes: "short" };
    expect(canTick(row, fixed, 2026)).toBe(true);
    expect(canTick(row, { ...fixed, notes: "y".repeat(501) }, 2026)).toBe(false);
  });

  it("an update row without updatedAt shows a clear problem instead of failing the whole Apply", () => {
    const row = { ...march, existing: { ...march.existing!, updatedAt: null } };
    expect(blockingProblems(row, undefined, 2026)).toContain("Cannot update safely: read the document again");
    expect(canTick(row, draftFromRow(row), 2026)).toBe(false);
  });
});

describe("confirmation text for weak matches", () => {
  it("lists ticked name-only overwrites, first 5 plus a count of the rest", () => {
    const puasa = find("Hari Raya Puasa");
    expect(weakOverwrites(plan, new Set([puasa.rowId]), {})).toEqual(["Hari Raya Puasa (2026-03-20)"]);
    expect(weakOverwrites(plan, new Set([find("Christmas Day").rowId]), {})).toEqual([]);
    expect(confirmMessage({ add: 1, update: 2 }, [])).toBe("This adds 1 and updates 2. You can Undo.");
    expect(confirmMessage({ add: 0, update: 1 }, ["A (d)"])).toBe(
      "This adds 0 and updates 1. You can Undo. 1 row was matched by name only and will overwrite: A (d)."
    );
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    expect(confirmMessage({ add: 0, update: 7 }, seven)).toContain("overwrite: a, b, c, d, e and 2 more.");
  });
});
