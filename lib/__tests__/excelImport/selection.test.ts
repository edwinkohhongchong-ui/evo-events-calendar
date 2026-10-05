import { describe, it, expect } from "vitest";
import type { ExcelPlan, ExcelPlanRow } from "../../excelImport/diffExcel";
import {
  applyLevelToUnknown,
  blockingProblems,
  buildSelection,
  canTick,
  confirmMessage,
  copyListText,
  defaultSelection,
  duplicateAdds,
  eventsWithoutLevel,
  planCounts,
  selectAllNew,
  shownFlags,
  tickState,
  toggleGroup,
  weakOverwrites,
  type Drafts,
  type EditContext,
} from "../../excelImport/selection";

// Synthetic data only: invented names.
const ctx: EditContext = { levels: ["Youth", "Adults"], docYear: 2026 };
const AT = "2026-01-02T00:00:00.5+00:00";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let n = 0;

const row = (over: Partial<ExcelPlanRow> = {}): ExcelPlanRow => ({
  rowId: `r${++n}`, kind: "event", status: "new", month: "2026-03", name: "Y: Study Circle", category: "Youth", start: "2026-03-03", end: "2026-03-03",
  time: "19:00", endTime: null, notes: "", op: "create", existingId: null, existing: null, matchKind: null, changes: [], flags: [], invalid: false,
  defaultSelected: true, possibleDuplicates: [], source: { sheet: "Mar-26", cell: "A1", text: "x" },
  values: { name: "Y: Study Circle", event_date: "2026-03-03", event_time: "19:00", end_time: null, level: "Youth", location: null, notes: null, event_type: "Event", gathering_type: null, preacher_name: null },
  ...over,
});
const season = (over: Partial<ExcelPlanRow> = {}): ExcelPlanRow =>
  row({ kind: "season", name: "Term Break", category: "School Schedule", start: "2026-03-14", end: "2026-03-22", time: null, values: { name: "Term Break", category: "School Schedule", start: "2026-03-14", end: "2026-03-22", notes: "", color: "teal" }, ...over });
const holiday = (over: Partial<ExcelPlanRow> = {}): ExcelPlanRow =>
  row({ kind: "holiday", name: "Awareness Day", category: "International Observance", start: "2026-03-08", end: "2026-03-08", time: null, defaultSelected: false, values: { name: "Awareness Day", category: "International Observance", start: "2026-03-08" }, ...over });
const item = (over: Partial<ExcelPlanRow> = {}): ExcelPlanRow =>
  row({ kind: "checklist", month: null, name: "Book the hall", category: "Prep", start: "", end: "", time: null, values: { category: "Prep", item: "Book the hall", status: "Not Started", notes: null }, ...over });

const planOf = (p: Partial<ExcelPlan>): ExcelPlan => ({
  docYear: 2026, events: [], seasons: [], holidays: [], checklist: [], months: [],
  missingFromWorkbook: { events: [], seasons: [], holidays: [], checklist: [] },
  summary: {} as ExcelPlan["summary"], ...p,
});

describe("default ticks", () => {
  it("ticks only rows the importer defaulted on that are also valid", () => {
    const ok = row();
    const noLevel = row({ category: "", defaultSelected: false });
    const defaultedButNoLevel = row({ category: "" }); // a row the importer ticked but whose level is empty cannot stay ticked
    const obs = holiday();
    const plan = planOf({ events: [ok, noLevel, defaultedButNoLevel], holidays: [obs] });
    expect(Array.from(defaultSelection(plan, ctx))).toEqual([ok.rowId]);
  });

  it("'Select all new' takes valid new rows of every kind but not changed, unchanged or duplicate rows", () => {
    const rows = [
      row(), season(), holiday(), item(),
      row({ status: "changed", op: "update", existingId: ID, existing: { name: "x", category: "Youth", start: "2026-03-03", end: "2026-03-03", time: null, endTime: null, notes: "", updatedAt: AT, repeating: false } }),
      row({ status: "possible-duplicate" }),
      row({ status: "unchanged", op: null }),
      row({ category: "" }),
    ];
    const plan = planOf({ events: [rows[0], rows[4], rows[5], rows[6], rows[7]], seasons: [rows[1]], holidays: [rows[2]], checklist: [rows[3]] });
    const picked = selectAllNew(plan, {}, ctx);
    expect(picked.has(rows[0].rowId) && picked.has(rows[1].rowId) && picked.has(rows[2].rowId) && picked.has(rows[3].rowId)).toBe(true);
    expect(picked.size).toBe(4); // the four valid new rows only
  });
});

describe("what can be ticked", () => {
  it("blocks rows with no operation, with the reason", () => {
    const unchanged = row({ status: "unchanged", op: null });
    expect(canTick(unchanged, undefined, ctx)).toBe(false);
    expect(blockingProblems(unchanged, undefined, ctx)[0]).toMatch(/Already in the calendar/);
    const repeating = row({ status: "changed", op: null, flags: [{ code: "repeating-event", severity: "warn", message: "Part of a repeating event." }] });
    expect(blockingProblems(repeating, undefined, ctx)).toEqual(["Part of a repeating event."]);
  });

  it("blocks an untouched row with an error flag, and a new event with no level", () => {
    expect(canTick(row({ flags: [{ code: "no-name", severity: "error", message: "Nothing to import." }], invalid: true }), undefined, ctx)).toBe(false);
    expect(blockingProblems(row({ category: "" }), undefined, ctx)).toContain("Pick a level.");
  });

  it("re-validates live after an edit and clears fixable flags", () => {
    const r = row({ category: "", flags: [{ code: "level-unknown", severity: "warn", message: "Pick one." }, { code: "possible-duplicate", severity: "warn", message: "Similar." }] });
    expect(canTick(r, undefined, ctx)).toBe(false);
    const edited = { name: r.name, category: "Youth", start: r.start, end: r.end, time: "19:00", endTime: "", notes: "", status: "" };
    expect(canTick(r, edited, ctx)).toBe(true);
    // level-unknown goes once a level is chosen; unrelated flags stay.
    expect(shownFlags(r, edited).map((f) => f.code)).toEqual(["possible-duplicate"]);
    expect(shownFlags(r, undefined)).toHaveLength(2);
  });

  it("applies the server's rules to edits: name length, date, level list, times, end after start", () => {
    const r = row();
    const base = { name: r.name, category: "Youth", start: r.start, end: r.end, time: "19:00", endTime: "", notes: "", status: "" };
    expect(blockingProblems(r, { ...base, name: "  " }, ctx)).toContain("Give it a name.");
    expect(blockingProblems(r, { ...base, name: "x".repeat(121) }, ctx).join()).toMatch(/120 characters/);
    expect(blockingProblems(r, { ...base, start: "2026-02-30" }, ctx).join()).toMatch(/not a valid date/);
    expect(blockingProblems(r, { ...base, category: "Nope" }, ctx)).toContain("That level does not exist in the calendar.");
    expect(blockingProblems(r, { ...base, endTime: "18:00" }, ctx)).toContain("The end time must be after the start time.");
    expect(blockingProblems(r, { ...base, time: "", endTime: "18:00" }, ctx)).toContain("An end time needs a start time.");
    expect(blockingProblems(r, { ...base, notes: "n".repeat(501) }, ctx).join()).toMatch(/500 characters/);
    expect(blockingProblems(r, { ...base, start: "2029-03-03" }, ctx).join()).toMatch(/more than a year away/);
  });

  it("checks seasons (end after start) and checklist (status, item)", () => {
    const s = season();
    expect(blockingProblems(s, { name: s.name, category: s.category, start: "2026-03-20", end: "2026-03-10", time: "", endTime: "", notes: "", status: "" }, ctx).join()).toMatch(/end date is before/);
    const c = item();
    expect(blockingProblems(c, { name: "", category: "Prep", start: "", end: "", time: "", endTime: "", notes: "", status: "Not Started" }, ctx)).toContain("Give the item some text.");
    expect(blockingProblems(c, { name: "Book", category: "Prep", start: "", end: "", time: "", endTime: "", notes: "", status: "Finished" }, ctx).join()).toMatch(/Pick a status/);
  });

  it("an update needs the edit marker, and an update with nothing left to change is blocked", () => {
    const base = { kind: "event" as const, status: "changed" as const, op: "update" as const, existingId: ID };
    const existing = { name: "x", category: "Youth", start: "2026-03-03", end: "2026-03-03", time: null, endTime: null, notes: "", repeating: false };
    expect(blockingProblems(row({ ...base, existing: { ...existing, updatedAt: null } }), undefined, ctx)).toContain("Cannot update safely: read the workbook again.");
    const ok = row({ ...base, existing: { ...existing, updatedAt: AT } });
    expect(canTick(ok, undefined, ctx)).toBe(true);
    expect(blockingProblems(ok, { name: ok.name, category: "", start: ok.start, end: ok.end, time: "", endTime: "", notes: "", status: "" }, ctx)).toContain("There is nothing to change.");
  });
});

describe("month and kind ticking", () => {
  const dup = row({ status: "possible-duplicate", defaultSelected: false });
  const weak = row({ status: "changed", op: "update", matchKind: "qualifier", existingId: ID, existing: { name: "Y: Study Circle", category: "Youth", start: "2026-03-03", end: "2026-03-03", time: "20:00", endTime: null, notes: "", updatedAt: AT, repeating: false } });
  const a = row();
  const b = row();
  const blocked = row({ category: "" });
  const rows = [a, b, dup, weak, blocked];

  it("counts only bulk-eligible rows (valid, not a duplicate, not a name-only match)", () => {
    expect(tickState(rows, new Set(), {}, ctx)).toEqual({ state: "none", eligible: 2, ticked: 0 });
    expect(tickState(rows, new Set([a.rowId]), {}, ctx).state).toBe("some");
    expect(tickState(rows, new Set([a.rowId, b.rowId]), {}, ctx).state).toBe("all");
  });

  it("toggling ticks every eligible row, then unticks them, leaving other ticks alone", () => {
    const keep = new Set([dup.rowId]);
    const ticked = toggleGroup(rows, keep, {}, ctx);
    expect(Array.from(ticked).sort()).toEqual([a.rowId, b.rowId, dup.rowId].sort());
    const cleared = toggleGroup(rows, ticked, {}, ctx);
    expect(Array.from(cleared)).toEqual([dup.rowId]);
    // from "some", a click ticks the rest
    expect(tickState(rows, toggleGroup(rows, new Set([a.rowId]), {}, ctx), {}, ctx).state).toBe("all");
  });
});

describe("Set level for events without one", () => {
  const mar = row({ category: "", month: "2026-03", defaultSelected: false });
  const apr = row({ category: "", month: "2026-04", start: "2026-04-07", defaultSelected: false, values: { ...row().values, event_date: "2026-04-07" } });
  const has = row({ category: "Adults" });
  const dupNoLevel = row({ category: "", month: "2026-05", status: "possible-duplicate", defaultSelected: false });
  const plan = planOf({ events: [mar, apr, has, dupNoLevel] });

  it("lists new events lacking a level, optionally limited to months", () => {
    expect(eventsWithoutLevel(plan, {}, null).map((r) => r.rowId)).toEqual([mar.rowId, apr.rowId, dupNoLevel.rowId]);
    expect(eventsWithoutLevel(plan, {}, new Set(["2026-03"])).map((r) => r.rowId)).toEqual([mar.rowId]);
  });

  it("sets the level in the chosen months, ticks plain new events, never touches events that have a level", () => {
    const out = applyLevelToUnknown(plan, {}, new Set(), "Youth", new Set(["2026-03"]), ctx);
    expect(out.changed).toBe(1);
    expect(out.drafts[mar.rowId].category).toBe("Youth");
    expect(out.selected.has(mar.rowId)).toBe(true);
    expect(out.drafts[apr.rowId]).toBeUndefined();
    expect(out.drafts[has.rowId]).toBeUndefined();
  });

  it("with no month limit it covers every month, but a possible duplicate gets the level without being ticked", () => {
    const out = applyLevelToUnknown(plan, {}, new Set(), "Youth", null, ctx);
    expect(out.changed).toBe(3);
    expect(out.selected.has(apr.rowId)).toBe(true);
    expect(out.drafts[dupNoLevel.rowId].category).toBe("Youth");
    expect(out.selected.has(dupNoLevel.rowId)).toBe(false);
  });

  it("does not tick a row that is still invalid (a level the calendar does not have)", () => {
    const out = applyLevelToUnknown(plan, {}, new Set(), "Nope", null, ctx);
    expect(out.selected.size).toBe(0);
  });
});

describe("what Apply receives", () => {
  it("builds create and update rows with ids and the edit marker, from ticked valid rows only", () => {
    const create = row();
    const updateRow = row({
      status: "changed", op: "update", existingId: ID, notes: "Merged note",
      existing: { name: "Y: Study Circle", category: "Youth", start: "2026-03-03", end: "2026-03-03", time: "18:00", endTime: null, notes: "", updatedAt: AT, repeating: false },
    });
    const bad = row({ category: "" });
    const sea = season();
    const plan = planOf({ events: [create, updateRow, bad], seasons: [sea] });
    const sel = buildSelection(plan, new Set([create.rowId, updateRow.rowId, bad.rowId, sea.rowId]), {}, ctx);
    expect(sel.map((s) => [s.kind, s.op])).toEqual([["event", "create"], ["event", "update"], ["season", "create"]]);
    expect(sel[0]).not.toHaveProperty("id");
    expect(sel[1]).toMatchObject({ id: ID, expectedUpdatedAt: AT });
    expect(sel[1].values).toMatchObject({ event_time: "19:00", notes: "Merged note" });
  });

  it("carries edits into the values", () => {
    const e = row({ category: "" });
    const s = season();
    const c = item();
    const h = holiday();
    const plan = planOf({ events: [e], seasons: [s], holidays: [h], checklist: [c] });
    const drafts: Drafts = {
      [e.rowId]: { name: "Y: Renamed", category: "Adults", start: "2026-03-04", end: "2026-03-04", time: "20:00", endTime: "21:00", notes: "hi", status: "" },
      [s.rowId]: { name: "Term Break 2", category: "School Schedule", start: "2026-03-15", end: "2026-03-20", time: "", endTime: "", notes: "n", status: "" },
      [c.rowId]: { name: "Book the big hall", category: "Prep", start: "", end: "", time: "", endTime: "", notes: "", status: "Done" },
      [h.rowId]: { name: "Awareness Day 2", category: h.category, start: "2026-03-09", end: "2026-03-09", time: "", endTime: "", notes: "", status: "" },
    };
    const sel = buildSelection(plan, new Set([e.rowId, s.rowId, c.rowId, h.rowId]), drafts, ctx);
    expect(sel[0].values).toMatchObject({ name: "Y: Renamed", event_date: "2026-03-04", event_time: "20:00", end_time: "21:00", level: "Adults", notes: "hi" });
    expect(sel[1].values).toMatchObject({ name: "Term Break 2", start: "2026-03-15", end: "2026-03-20", notes: "n", color: "teal" });
    expect(sel[2].values).toMatchObject({ name: "Awareness Day 2", start: "2026-03-09" });
    expect(sel[3].values).toMatchObject({ item: "Book the big hall", status: "Done", category: "Prep", notes: null });
  });
});

describe("confirm text and counts", () => {
  it("lists name-only overwrites and ticked duplicates", () => {
    const weak = row({ status: "changed", op: "update", matchKind: "qualifier", existingId: ID, existing: { name: "Y: Old Name", category: "Youth", start: "2026-03-03", end: "2026-03-03", time: null, endTime: null, notes: "", updatedAt: AT, repeating: false } });
    const dup = row({ status: "possible-duplicate", possibleDuplicates: [{ id: "x", name: "Y: Study Circle", start: "2026-03-03", end: "2026-03-03", time: "19:00" }] });
    const plan = planOf({ events: [weak, dup] });
    const picked = new Set([weak.rowId, dup.rowId]);
    expect(weakOverwrites(plan, picked, {}, ctx)).toEqual(["Y: Old Name (2026-03-03)"]);
    expect(duplicateAdds(plan, picked, {}, ctx)).toEqual(["Y: Study Circle (2026-03-03)"]);
    const msg = confirmMessage({ add: 1, update: 1 }, ["A (d)"], ["B (d)"]);
    expect(msg).toContain("adds 1 and updates 1");
    expect(msg).toMatch(/matched by name only and will overwrite: A \(d\)/);
    expect(msg).toMatch(/will still be added: B \(d\)/);
    expect(confirmMessage({ add: 2, update: 0 }, [], [])).toBe("This adds 2 and updates 0. You can Undo.");
  });

  it("counts statuses and attention; routine flags do not count", () => {
    const plan = planOf({
      events: [
        row(), row({ status: "changed" }), row({ status: "unchanged", op: null }), row({ status: "possible-duplicate" }),
        row({ flags: [{ code: "no-time", severity: "warn", message: "x" }] }),
        row({ flags: [{ code: "level-unknown", severity: "warn", message: "x" }] }),
      ],
      checklist: [item()],
    });
    expect(planCounts(plan)).toMatchObject({ new: 4, changed: 1, unchanged: 1, possibleDuplicates: 1, needAttention: 1, byKind: { event: 6, season: 0, holiday: 0, checklist: 1 } });
  });

  it("copies a list of the ticked rows, or every row when none are ticked", () => {
    const e = row();
    const plan = planOf({ events: [e], seasons: [season()] });
    expect(copyListText(plan, new Set([e.rowId]), {})).toBe("Events | Y: Study Circle | 2026-03-03 | 19:00 | Youth");
    expect(copyListText(plan, new Set(), {}).split("\n")).toHaveLength(2);
  });
});
