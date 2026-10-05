import { describe, it, expect } from "vitest";
import {
  checklistDupKey,
  combineExcelSummaries,
  eventDupKey,
  describeExcelApply,
  eventUpdateIds,
  validateExcelSelection,
  type ExcelApplyContext,
  type ExcelApplyRow,
} from "../../excelImport/applyValidation";
import { earliestExcelDate, EXCEL_CONFLICT_MESSAGE, runExcelImport, type ExcelWriters } from "../../excelImport/applyRunner";
import { MAX_EXCEL_APPLY_ROWS } from "../../excelImport/limits";
import { RowConflictError } from "../../rowConflict";

const ID1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AT = "2026-03-01T10:00:00.5+00:00";
const ctx = (over: Partial<ExcelApplyContext> = {}): ExcelApplyContext => ({
  levelNames: ["Youth", "Adults"],
  eventRecurring: new Map([[ID1, "None"], [ID2, "Weekly"]]),
  eventTimes: new Map([[ID1, { event_time: "18:00:00", end_time: "20:00:00" }], [ID2, { event_time: null, end_time: null }]]),
  existingEventKeys: new Set(),
  existingChecklistKeys: new Set(),
  ...over,
});

const E = (values: Record<string, unknown> = {}, over: Partial<ExcelApplyRow> = {}): ExcelApplyRow => ({
  kind: "event",
  op: "create",
  values: { name: "Study Night", event_date: "2026-03-02", event_time: "19:00", end_time: "20:30", level: "youth", location: null, notes: "Bring a friend", event_type: "Event", gathering_type: null, preacher_name: null, ...values },
  ...over,
});
const upd = (values: Record<string, unknown>, id = ID1): ExcelApplyRow => ({ kind: "event", op: "update", id, expectedUpdatedAt: AT, values });
const S = (values: Record<string, unknown> = {}, over: Partial<ExcelApplyRow> = {}): ExcelApplyRow => ({
  kind: "season", op: "create", values: { name: "Camp Season", category: "Ministry Season", start: "2026-05-01", end: "2026-05-04", notes: "", ...values }, ...over,
});
const H = (values: Record<string, unknown> = {}): ExcelApplyRow => ({ kind: "holiday", op: "create", values: { name: "Awareness Day", category: "International Observance", start: "2026-03-08", ...values } });
const C = (values: Record<string, unknown> = {}, over: Partial<ExcelApplyRow> = {}): ExcelApplyRow => ({
  kind: "checklist", op: "create", values: { category: "Prep", item: "Book the hall", status: "Not Started", notes: "", ...values }, ...over,
});

const bad = (rows: unknown, c = ctx()) => {
  const r = validateExcelSelection(rows, c);
  if (r.ok) throw new Error("expected a rejection");
  return r.error;
};
const good = (rows: unknown, c = ctx()) => {
  const r = validateExcelSelection(rows, c);
  if (!r.ok) throw new Error(r.error);
  return r.rows;
};

describe("validateExcelSelection: shape and caps", () => {
  it("rejects non-arrays, empty, and over-cap selections", () => {
    expect(bad("x")).toMatch(/Nothing to import/);
    expect(bad([])).toMatch(/No rows/);
    expect(bad(Array.from({ length: MAX_EXCEL_APPLY_ROWS + 1 }, (_, i) => E({ name: `N${i}` })))).toMatch(/more than 300/);
    expect(good(Array.from({ length: MAX_EXCEL_APPLY_ROWS }, (_, i) => E({ name: `N${i}` })))).toHaveLength(MAX_EXCEL_APPLY_ROWS);
  });

  it("rejects an unknown kind, op, or missing values, naming the row", () => {
    expect(bad([E(), { kind: "nope", op: "create", values: {} }])).toMatch(/Row 2 .*not a valid row/);
    expect(bad([{ kind: "event", op: "delete", values: {} }])).toMatch(/Row 1/);
    expect(bad([{ kind: "event", op: "create" }])).toMatch(/not a valid row/);
    expect(bad([null])).toMatch(/not a valid row/);
    expect(bad([{ kind: "event", op: "create", values: [] }])).toMatch(/not a valid row/);
  });

  it("update ids must be UUIDs and tokens ISO timestamps", () => {
    expect(bad([upd({ event_time: "19:00" }, "not-a-uuid")])).toMatch(/missing the calendar entry/);
    expect(bad([{ ...upd({ event_time: "19:00" }), expectedUpdatedAt: "yesterday" }])).toMatch(/last read/);
    expect(bad([{ ...upd({ event_time: "19:00" }), expectedUpdatedAt: undefined }])).toMatch(/last read/);
  });

  it("rejects two updates of the same row and duplicate creates", () => {
    expect(bad([upd({ event_time: "19:00" }), upd({ event_time: "20:00" })])).toMatch(/same calendar entry/);
    expect(bad([E(), E({ name: "STUDY night" })])).toMatch(/same as an earlier row/);
    expect(bad([S(), S()])).toMatch(/same as an earlier row/);
    expect(bad([H(), H()])).toMatch(/same as an earlier row/);
    expect(bad([C(), C({ item: "BOOK THE HALL" })])).toMatch(/same as an earlier row/);
  });
});

describe("validateExcelSelection: events", () => {
  it("builds the same values createEvent takes: single occurrence, level spelled as in the table, times as HH:mm:ss", () => {
    const [row] = good([E()]);
    expect(row).toMatchObject({
      kind: "event",
      op: "create",
      values: { name: "Study Night", event_date: "2026-03-02", end_date: null, event_time: "19:00:00", end_time: "20:30:00", duration_minutes: 90, level: "Youth", recurring: "None", repeat_until: null, notes: "Bring a friend", event_type: "Event" },
    });
  });

  it("cleans text on the server (control and zero-width characters)", () => {
    const [row] = good([E({ name: "  Study​   Night\n", notes: "a‮b" })]);
    expect((row.values as { name: string; notes: string }).name).toBe("Study Night");
    expect((row.values as { notes: string }).notes).toBe("ab");
  });

  it.each([
    ["no name", { name: "   " }, /Give it a name/],
    ["name over 120", { name: "n".repeat(121) }, /120 characters/],
    ["non-string name", { name: 5 }, /Give it a name/],
    ["bad date", { event_date: "2026-02-30" }, /not a valid date/],
    ["date before MIN_YEAR", { event_date: "1999-01-01" }, /between 2000 and 2100/],
    ["date after MAX_YEAR", { event_date: "2101-01-01" }, /between 2000 and 2100/],
    ["bad start time", { event_time: "25:00" }, /start time/],
    ["bad end time", { end_time: "7pm" }, /end time/],
    ["end without start", { event_time: null, end_time: "20:00" }, /needs a start time/],
    ["end before start", { event_time: "20:00", end_time: "19:00" }, /after the start time/],
    ["end equal to start", { event_time: "20:00", end_time: "20:00" }, /after the start time/],
    ["level missing", { level: "" }, /Pick a level/],
    ["level not in table", { level: "Poly" }, /Pick a level/],
    ["notes over 500", { notes: "n".repeat(501) }, /500 characters/],
    ["notes not text", { notes: 5 }, /500 characters/],
    ["location over 120", { location: "l".repeat(121) }, /location/],
    ["bad event type", { event_type: "Meeting" }, /Event or Gathering/],
    ["bad gathering type", { event_type: "Gathering", gathering_type: "Party" }, /Gathering type/],
    ["preacher too long", { preacher_name: "p".repeat(121) }, /preacher/],
    ["non-boolean focus", { pastoral_youth: "yes" }, /true or false/],
  ])("rejects: %s", (_n, values, re) => {
    expect(bad([E(values)])).toMatch(re);
    expect(bad([E(values)])).toMatch(/Nothing was imported/);
  });

  it("a Gathering keeps its type; an Event drops one", () => {
    expect((good([E({ event_type: "Gathering", gathering_type: "YTH Gathering", level: "Youth" })])[0].values as { gathering_type: string }).gathering_type).toBe("YTH Gathering");
    expect((good([E({ gathering_type: "YTH Gathering" })])[0].values as { gathering_type: unknown }).gathering_type).toBeNull();
  });

  it("never lets the browser set recurrence, owner, id or other columns", () => {
    const [row] = good([E({ recurring: "Weekly", repeat_until: "2026-12-01", owner: "x", id: "evil", series: "s", theme: "t", created_at: "x" })]);
    expect(row.values).toMatchObject({ recurring: "None", repeat_until: null, series: null, theme: null });
    expect(row.values).not.toHaveProperty("owner");
    expect(row.values).not.toHaveProperty("id");
    expect(row.values).not.toHaveProperty("created_at");
  });
});

describe("validateExcelSelection: event updates", () => {
  it("builds a patch of only the supplied fields (never name, date, owner)", () => {
    const [row] = good([upd({ name: "Renamed", event_date: "2030-01-01", event_time: "18:00", end_time: "19:00", level: "adults", notes: "n" })]);
    expect(row).toEqual({ kind: "event", op: "update", id: ID1, expectedUpdatedAt: AT, values: { event_time: "18:00:00", end_time: "19:00:00", duration_minutes: 60, level: "Adults", notes: "n" } });
  });

  it("a blank never erases saved data; an empty patch is rejected", () => {
    expect(good([upd({ event_time: "18:00", end_time: null, notes: "", level: "" })])[0].values).toEqual({ event_time: "18:00:00" });
    expect(bad([upd({ event_time: null, notes: "" })])).toMatch(/nothing to change/);
  });

  it("rejects an unknown level, an update of a repeating series, and an event that is gone", () => {
    expect(bad([upd({ event_time: "18:00", level: "Poly" })])).toMatch(/level does not exist/);
    expect(bad([upd({ event_time: "18:00" }, ID2)])).toMatch(/repeating event/);
    expect(bad([upd({ event_time: "18:00" }), upd({ event_time: "18:00" }, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")])).toMatch(/no longer exists/);
  });

  it("eventUpdateIds lists only valid event-update ids, once", () => {
    expect(eventUpdateIds([upd({}, ID1), upd({}, ID1.toUpperCase()), upd({}, "bad"), S(), E()])).toEqual([ID1]);
    expect(eventUpdateIds("x")).toEqual([]);
  });
});

describe("validateExcelSelection: seasons, holidays, checklist", () => {
  it("season and holiday rows use the Word importer's rules, with this selection's row number", () => {
    expect(bad([E(), S({ category: "Nope" })])).toMatch(/^Row 2 .*Pick a category/);
    expect(bad([H({ start: "2026-13-01" })])).toMatch(/Row 1/);
    expect(bad([S({ start: "2026-05-05", end: "2026-05-01" })])).toMatch(/before the start/);
    const rows = good([S(), H()]);
    expect(rows.map((r) => r.kind)).toEqual(["season", "holiday"]);
  });

  it("season and holiday updates need an id and a token", () => {
    expect(bad([S({}, { op: "update" })])).toMatch(/missing the calendar entry/);
    const [row] = good([S({}, { op: "update", id: ID1, expectedUpdatedAt: AT })]);
    expect(row).toMatchObject({ kind: "season", op: "update", id: ID1 });
  });

  it("checklist: status must be a real status; create needs item and section", () => {
    expect(bad([C({ status: "Finished" })])).toMatch(/Pick a status/);
    expect(bad([C({ item: " " })])).toMatch(/some text/);
    expect(bad([C({ category: "" })])).toMatch(/section/);
    expect(bad([C({ item: "i".repeat(201) })])).toMatch(/200 characters/);
    expect(bad([C({ notes: "n".repeat(501) })])).toMatch(/500/);
    const [row] = good([C({ status: "Done" })]);
    expect(row.values).toMatchObject({ category: "Prep", item: "Book the hall", status: "Done", target_month: null, linked_event_id: null, auto_check_type: null });
  });

  it("a checklist update changes only status (and notes when supplied), never item or section", () => {
    const [row] = good([C({ item: "Hijack", category: "Hijack", status: "Done", notes: "" }, { op: "update", id: ID1, expectedUpdatedAt: AT })]);
    expect(row.values).toEqual({ status: "Done" });
  });

  it("one bad row rejects the lot", () => {
    expect(bad([E(), S(), H(), C(), E({ level: "Poly", name: "Other" })])).toMatch(/^Row 5 /);
  });
});

describe("runExcelImport", () => {
  function writers(failOn?: string, conflictOn?: string): ExcelWriters & { calls: string[] } {
    const calls: string[] = [];
    const ins = (table: "events" | "seasons" | "holidays" | "checklist", label: string) => async (v: { name?: string; item?: string }) => {
      const key = v.name ?? v.item ?? label;
      calls.push(`${label}:${key}`);
      if (key === failOn) throw new Error('duplicate key value violates unique constraint "x"');
      return { id: `${table}-${key}`, affected: [{ table, id: `${table}-${key}`, before: null, after: { ...v } }] };
    };
    const up = (table: "events" | "seasons" | "holidays" | "checklist", label: string) => async (id: string) => {
      calls.push(`${label}:${id}`);
      if (id === conflictOn) throw new RowConflictError();
      return [{ table, id, before: { id }, after: { id } }];
    };
    return {
      calls,
      insertEvent: ins("events", "insEvent"),
      updateEvent: up("events", "updEvent"),
      insertSeason: ins("seasons", "insSeason"),
      updateSeason: up("seasons", "updSeason"),
      insertHoliday: ins("holidays", "insHoliday"),
      updateHoliday: up("holidays", "updHoliday"),
      insertChecklist: ins("checklist", "insChecklist"),
      updateChecklist: up("checklist", "updChecklist"),
    } as ExcelWriters & { calls: string[] };
  }
  const rows = (...r: ExcelApplyRow[]) => good(r);

  it("routes every kind and op to its writer in order and collects all affected rows", async () => {
    const w = writers();
    const out = await runExcelImport(
      rows(E({ name: "A" }), upd({ event_time: "18:00" }), S({ name: "B" }), S({ name: "C" }, { op: "update", id: ID1, expectedUpdatedAt: AT }), H({ name: "D" }), C({ item: "F" }), C({ item: "G" }, { op: "update", id: ID2, expectedUpdatedAt: AT })),
      w
    );
    expect(w.calls).toEqual(["insEvent:A", `updEvent:${ID1}`, "insSeason:B", `updSeason:${ID1}`, "insHoliday:D", "insChecklist:F", `updChecklist:${ID2}`]);
    expect(out.affected).toHaveLength(7);
    expect(out.summary).toMatchObject({ eventsAdded: 1, eventsUpdated: 1, seasonsAdded: 1, seasonsUpdated: 1, holidaysAdded: 1, holidaysUpdated: 0, checklistAdded: 1, checklistUpdated: 1, failed: null, notAttempted: 0 });
  });

  it("stops at the first failure and returns what was saved as data, with no raw database text", async () => {
    const w = writers("B");
    const out = await runExcelImport(rows(E({ name: "A" }), E({ name: "B" }), E({ name: "C" })), w);
    expect(w.calls).toEqual(["insEvent:A", "insEvent:B"]);
    expect(out.affected.map((a) => a.id)).toEqual(["events-A"]);
    expect(out.summary.failed).toEqual({ row: 2, name: "B", message: "Something went wrong. Please try again." });
    expect(out.summary.notAttempted).toBe(1);
    expect(describeExcelApply(out.summary)).toMatch(/Stopped at row 2 .*1 row was already saved .*can be undone.*1 later row was not tried/);
  });

  it("an edit conflict is reported in plain words", async () => {
    const out = await runExcelImport(rows(upd({ event_time: "18:00" })), writers(undefined, ID1));
    expect(out.summary.failed?.message).toBe(EXCEL_CONFLICT_MESSAGE);
    expect(out.affected).toEqual([]);
  });

  it("several calls combine into one summary and one affected list (the client's single Undo record)", async () => {
    const first = await runExcelImport(rows(E({ name: "A" }), E({ name: "B" })), writers());
    const second = await runExcelImport(rows(S({ name: "C" })), writers());
    const all = [...first.affected, ...second.affected];
    expect(all.map((a) => a.table)).toEqual(["events", "events", "seasons"]);
    const total = combineExcelSummaries([first.summary, second.summary]);
    expect(total).toMatchObject({ eventsAdded: 2, seasonsAdded: 1, failed: null });
    expect(describeExcelApply(total)).toBe("Added 2 events, added 1 season.");
  });

  it("earliestExcelDate picks the earliest date a create carries", () => {
    expect(earliestExcelDate(rows(E({ event_date: "2026-04-01" }), H({ start: "2026-03-08" }), S({ start: "2026-05-01", end: "2026-05-02" })))).toBe("2026-03-08");
    expect(earliestExcelDate(rows(C()))).toBeNull();
  });
});

describe("validateExcelSelection: already in the calendar and saved end time", () => {
  it("rejects an event create that matches a saved event by normalised name, date and start time", () => {
    const c = ctx({ existingEventKeys: new Set([eventDupKey("study night", "2026-03-02", "19:00:00")]) });
    expect(bad([E({ name: "  Study   NIGHT " })], c)).toMatch(/Row 1 .*already in the calendar.*nothing was imported/i);
    expect(good([E({ event_time: "19:30", end_time: "20:30" })], c)).toHaveLength(1);
    expect(good([E({ event_date: "2026-03-03" })], c)).toHaveLength(1);
  });

  it("rejects a checklist create that matches a saved item by category and item", () => {
    const c = ctx({ existingChecklistKeys: new Set([checklistDupKey("prep", "book the hall")]) });
    expect(bad([C({ item: "Book  the Hall" })], c)).toMatch(/already in the calendar/);
    expect(good([C({ item: "Book the band" })], c)).toHaveLength(1);
  });

  it("rejects a new start time that is not before the saved end time", () => {
    expect(bad([upd({ event_time: "20:00" })])).toMatch(/not before the end time already saved \(20:00\)/);
    expect(bad([upd({ event_time: "21:00" })])).toMatch(/not before the end time/);
    expect(good([upd({ event_time: "19:00" })])).toHaveLength(1);
  });

  it("does not check the saved end when the patch also sets an end, or when none is saved", () => {
    expect(good([upd({ event_time: "21:00", end_time: "22:00" })])).toHaveLength(1);
    expect(bad([upd({ event_time: "21:00", end_time: "20:00" })])).toMatch(/end time must be after/);
  });
});
