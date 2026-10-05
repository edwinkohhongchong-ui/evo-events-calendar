import { describe, it, expect } from "vitest";
import { eventNameKey, planExcelDiff } from "../../excelImport/diffExcel";
import type { ExcelExisting } from "../../excelImport/diffExcel";
import type { ClassifiedExcel, PlannedChecklist, PlannedEvent, PlannedHoliday, PlannedSeason } from "../../excelImport/classifyExcel";
import type { ChecklistRow, EventRow, HolidayRow, SeasonRow } from "../../types";

// Synthetic data only: invented names, no real calendar content.

const SRC = { sheet: "Mar", cell: "A1", text: "x" };
const LEVELS = [
  { id: "l1", name: "Youth", color_key: "indigo" as const, sort_order: 1 },
  { id: "l2", name: "Adults", color_key: "teal" as const, sort_order: 2 },
];

let n = 0;
const ev = (over: Partial<PlannedEvent> = {}): PlannedEvent => {
  const e: PlannedEvent = {
    kind: "event", key: `event|k${++n}`, source: SRC, flags: [], invalid: false, defaultSelected: true,
    name: "Y: Study Circle", originalName: "Study Circle", date: "2026-03-02", event_time: "19:00:00", end_time: null, duration_minutes: null,
    level: "Youth", event_type: "Event", gathering_type: null, preacher_name: null,
    pastoral_youth: true, pastoral_poly: false, pastoral_uni: false, pastoral_adults: false, recurring: "None", notes: "",
    ...over,
  };
  return e;
};
const exRow = (over: Partial<EventRow> = {}): EventRow => ({
  id: `e${++n}`, name: "Y: Study Circle", event_date: "2026-03-02", end_date: null, event_time: "19:00:00", end_time: null, duration_minutes: null,
  level: "Youth", recurring: "None", repeat_until: null, notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00.5+00:00",
  event_type: "Event", pastoral_youth: true, pastoral_poly: false, pastoral_uni: false, pastoral_adults: false,
  location: null, gathering_type: null, series: null, preacher_name: null, sermon_title: null, theme: null,
  ...over,
});
const season = (over: Partial<PlannedSeason> = {}): PlannedSeason => ({
  kind: "season", key: `season|k${++n}`, source: SRC, flags: [], invalid: false, defaultSelected: true,
  name: "Term Break", category: "School Schedule", start_date: "2026-03-14", end_date: "2026-03-22", notes: "", color: "teal",
  ...over,
});
const holiday = (over: Partial<PlannedHoliday> = {}): PlannedHoliday => ({
  kind: "holiday", key: `holiday|k${++n}`, source: SRC, flags: [], invalid: false, defaultSelected: true,
  date: "2026-03-08", name: "Founders Awareness Day", type: "International Observance", knownPublicHoliday: false,
  ...over,
});
const item = (over: Partial<PlannedChecklist> = {}): PlannedChecklist => ({
  kind: "checklist", key: `checklist|k${++n}`, source: SRC, flags: [], invalid: false, defaultSelected: true,
  category: "Prep", item: "Book the hall", status: "Not Started", target_month: null, notes: "",
  ...over,
});
const classified = (over: Partial<ClassifiedExcel> = {}): ClassifiedExcel => ({
  docYear: 2026, events: [], seasons: [], holidays: [], checklist: [], duplicatesDropped: 0, ...over,
});
const existing = (over: Partial<ExcelExisting> = {}): ExcelExisting => ({
  events: [], overrides: [], exceptions: [], seasons: [], holidays: [], checklist: [], levels: LEVELS, ...over,
});
const S = (over: Partial<SeasonRow> = {}): SeasonRow => ({
  id: `s${++n}`, name: "Term Break", category: "School Schedule", start_date: "2026-03-14", end_date: "2026-03-22", notes: null, color: null, updated_at: "2026-01-02T00:00:00+00:00", ...over,
});
const H = (over: Partial<HolidayRow> = {}): HolidayRow => ({ id: `h${++n}`, holiday_date: "2026-03-08", name: "Founders Awareness Day", type: "International Observance", updated_at: "2026-01-02T00:00:00+00:00", ...over });
const C = (over: Partial<ChecklistRow> = {}): ChecklistRow => ({
  id: `c${++n}`, category: "Prep", item: "Book the hall", status: "Not Started", target_month: null, notes: null, linked_event_id: null, auto_check_type: null, ...over,
});

describe("eventNameKey", () => {
  it("ignores case, punctuation and the prefix style but keeps the prefix letters", () => {
    expect(eventNameKey("Y. Study Circle")).toBe(eventNameKey("y: study circle"));
    expect(eventNameKey("Y - Study Circle (tentative)")).toBe(eventNameKey("Y: Study Circle"));
    expect(eventNameKey("P: Study Circle")).not.toBe(eventNameKey("Y: Study Circle"));
  });
});

describe("events against expanded recurring events", () => {
  it("a weekly existing event matches the workbook's per-day cells", () => {
    const weekly = exRow({ recurring: "Weekly", repeat_until: null });
    const plan = planExcelDiff(
      classified({ events: [ev({ date: "2026-03-02" }), ev({ date: "2026-03-09" }), ev({ date: "2026-03-16" })] }),
      existing({ events: [weekly] })
    );
    expect(plan.events.map((r) => r.status)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(plan.events.every((r) => r.existingId === weekly.id && r.matchKind === "exact" && r.op === null && !r.defaultSelected)).toBe(true);
  });

  it("an override that moved an occurrence moves the match with it", () => {
    const weekly = exRow({ recurring: "Weekly" });
    const plan = planExcelDiff(
      classified({ events: [ev({ date: "2026-03-09" }), ev({ date: "2026-03-10" })] }),
      existing({
        events: [weekly],
        overrides: [{ id: "o1", event_id: weekly.id, original_date: "2026-03-09", new_date: "2026-03-10", new_time: null, new_end_date: null, created_at: "2026-02-01T00:00:00Z" }],
      })
    );
    const [onNinth, onTenth] = plan.events;
    expect(onNinth.status).toBe("new");
    expect(onTenth.status).toBe("unchanged");
  });

  it("an excepted occurrence is not there to match", () => {
    const weekly = exRow({ recurring: "Weekly" });
    const plan = planExcelDiff(
      classified({ events: [ev({ date: "2026-03-09" })] }),
      existing({ events: [weekly], exceptions: [{ id: "x", event_id: weekly.id, original_date: "2026-03-09" }] })
    );
    expect(plan.events[0].status).toBe("new");
  });

  it("matches across prefix style and case", () => {
    const plan = planExcelDiff(classified({ events: [ev({ name: "Y: Study Circle" })] }), existing({ events: [exRow({ name: "y. study circle" })] }));
    expect(plan.events[0].status).toBe("unchanged");
  });

  it("a changed time is 'changed' with old -> new, a weak match, unticked", () => {
    const e = exRow();
    const plan = planExcelDiff(classified({ events: [ev({ event_time: "20:00:00" })] }), existing({ events: [e] }));
    const r = plan.events[0];
    expect(r.status).toBe("changed");
    expect(r.matchKind).toBe("qualifier");
    expect(r.changes).toEqual([{ field: "time", from: "19:00", to: "20:00" }]);
    expect(r.op).toBe("update");
    expect(r.flags.map((f) => f.code)).toContain("weak-match");
    expect(r.defaultSelected).toBe(false);
  });

  it("same time but a new end time, level or note is 'changed' (and merges notes, never replaces them)", () => {
    const e = exRow({ notes: "Bring Bibles", level: "Adults" });
    const plan = planExcelDiff(classified({ events: [ev({ end_time: "20:30:00", notes: "Snacks after" })] }), existing({ events: [e] }));
    const r = plan.events[0];
    expect(r.status).toBe("changed");
    expect(r.changes.map((c) => c.field).sort()).toEqual(["end_time", "level", "notes"]);
    expect(r.matchKind).toBe("exact");
    expect((r.values as { notes: string }).notes).toBe("Bring Bibles\nSnacks after");
    expect(r.defaultSelected).toBe(false);
  });

  it("a workbook cell with no time fits an existing event of that name at any time", () => {
    const plan = planExcelDiff(classified({ events: [ev({ event_time: null })] }), existing({ events: [exRow({ event_time: "18:00:00" })] }));
    expect(plan.events[0].status).toBe("unchanged");
  });

  it("a change to an occurrence of a repeating series is shown but cannot be applied", () => {
    const plan = planExcelDiff(classified({ events: [ev({ end_time: "21:00:00" })] }), existing({ events: [exRow({ recurring: "Weekly" })] }));
    const r = plan.events[0];
    expect(r.status).toBe("changed");
    expect(r.op).toBeNull();
    expect(r.flags.map((f) => f.code)).toContain("repeating-event");
  });

  it("an existing event with no edit marker cannot be updated", () => {
    const plan = planExcelDiff(classified({ events: [ev({ end_time: "21:00:00" })] }), existing({ events: [exRow({ updated_at: undefined })] }));
    expect(plan.events[0].op).toBeNull();
    expect(plan.events[0].flags.map((f) => f.code)).toContain("no-update-token");
  });

  it("a different name at the same start time is a possible duplicate: never auto-matched, unticked", () => {
    const other = exRow({ name: "Board Game Night", level: "Adults" });
    const r = planExcelDiff(classified({ events: [ev()] }), existing({ events: [other] })).events[0];
    expect(r.status).toBe("possible-duplicate");
    expect(r.existingId).toBeNull();
    expect(r.possibleDuplicates.map((d) => d.id)).toEqual([other.id]);
    expect(r.op).toBe("create");
    expect(r.defaultSelected).toBe(false);
  });

  it("a very similar name on the same day (other time) is a possible duplicate", () => {
    const r = planExcelDiff(classified({ events: [ev({ name: "Y: Study Circle Extra", event_time: "10:00:00" })] }), existing({ events: [exRow({ name: "Y: Study Circle" })] })).events[0];
    expect(r.status).toBe("possible-duplicate");
  });

  it("an existing event already matched is not offered as a duplicate of another row", () => {
    const e = exRow();
    const plan = planExcelDiff(classified({ events: [ev(), ev({ name: "Y: Something Else" })] }), existing({ events: [e] }));
    expect(plan.events.map((r) => r.status)).toEqual(["unchanged", "new"]);
  });

  it("an exact match is paired before a weak one, whatever the order", () => {
    const a = exRow({ event_time: "18:00:00" });
    const b = exRow({ event_time: "19:00:00" });
    const plan = planExcelDiff(classified({ events: [ev({ event_time: "19:00:00" }), ev({ event_time: "18:00:00" })] }), existing({ events: [a, b] }));
    expect(plan.events.map((r) => [r.existingId, r.status])).toEqual([[b.id, "unchanged"], [a.id, "unchanged"]]);
  });
});

describe("event defaults and levels", () => {
  it("new, valid, known level, no flags: ticked, with the level's spelling from the levels table", () => {
    const r = planExcelDiff(classified({ events: [ev({ level: "youth" })] }), existing()).events[0];
    expect(r.status).toBe("new");
    expect(r.op).toBe("create");
    expect(r.category).toBe("Youth");
    expect(r.defaultSelected).toBe(true);
  });

  it("a level that is not in the levels table is dropped to '' and flagged, unticked", () => {
    const r = planExcelDiff(classified({ events: [ev({ level: "Poly" })] }), existing()).events[0];
    expect(r.category).toBe("");
    expect((r.values as { level: string }).level).toBe("");
    expect(r.flags.map((f) => f.code)).toContain("level-not-in-calendar");
    expect(r.defaultSelected).toBe(false);
  });

  it("no level at all is flagged level-unknown (once) and unticked", () => {
    const r = planExcelDiff(classified({ events: [ev({ level: "", flags: [{ code: "level-unknown", severity: "warn", message: "pick" }] })] }), existing()).events[0];
    expect(r.flags.filter((f) => f.code === "level-unknown")).toHaveLength(1);
    expect(r.defaultSelected).toBe(false);
  });

  it.each([
    ["invalid", { invalid: true, defaultSelected: false, flags: [{ code: "no-name" as const, severity: "error" as const, message: "bad" }] }],
    ["outside the month", { defaultSelected: false, flags: [{ code: "date-outside-month" as const, severity: "warn" as const, message: "edge" }] }],
    ["stale year", { defaultSelected: false, flags: [{ code: "stale-year-in-text" as const, severity: "warn" as const, message: "old" }] }],
  ])("%s rows are unticked", (_n, over) => {
    const r = planExcelDiff(classified({ events: [ev(over)] }), existing()).events[0];
    expect(r.defaultSelected).toBe(false);
  });

  it("an error flag makes the row invalid; an empty name is an error", () => {
    const r = planExcelDiff(classified({ events: [ev({ name: "  " })] }), existing()).events[0];
    expect(r.invalid).toBe(true);
    expect(r.flags.map((f) => f.code)).toContain("missing-name");
    expect(r.defaultSelected).toBe(false);
  });

  it("long notes are cut with a warning; a too-long name is an error", () => {
    const r = planExcelDiff(classified({ events: [ev({ notes: "n".repeat(600), name: "N".repeat(130) })] }), existing()).events[0];
    expect((r.values as { notes: string }).notes).toHaveLength(500);
    expect(r.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["notes-trimmed", "name-too-long"]));
    expect(r.invalid).toBe(true);
  });
});

describe("seasons", () => {
  it("exact existing season is unchanged, a new one is ticked, 'Other' is flagged and unticked", () => {
    const plan = planExcelDiff(
      classified({
        seasons: [
          season(),
          season({ name: "Camp Season", category: "Ministry Season", start_date: "2026-05-01", end_date: "2026-05-10" }),
          season({ name: "Mystery Tag", category: "Other", start_date: "2026-06-01", end_date: "2026-06-03" }),
        ],
      }),
      existing({ seasons: [S()] })
    );
    expect(plan.seasons.map((r) => [r.status, r.defaultSelected, r.op])).toEqual([["unchanged", false, null], ["new", true, "create"], ["new", false, "create"]]);
    expect(plan.seasons[2].flags.map((f) => f.code)).toContain("season-category-unknown");
  });

  it("a moved span is a weak match: changed, unticked, flagged, carrying the update token", () => {
    const e = S({ start_date: "2026-03-20", end_date: "2026-03-29" });
    const r = planExcelDiff(classified({ seasons: [season({ start_date: "2026-03-14", end_date: "2026-03-22" })] }), existing({ seasons: [e] })).seasons[0];
    expect(r.status).toBe("changed");
    expect(r.existing?.updatedAt).toBe(e.updated_at);
    expect(r.op).toBe("update");
    expect(r.defaultSelected).toBe(false);
  });

  it("a new season that overlaps a similar existing one lists it and starts unticked", () => {
    const r = planExcelDiff(classified({ seasons: [season({ name: "Break Week" })] }), existing({ seasons: [S()] })).seasons[0];
    expect(r.status).toBe("new");
    expect(r.possibleDuplicates).toHaveLength(1);
    expect(r.defaultSelected).toBe(false);
  });
});

describe("holidays (observances)", () => {
  it("an observance equal to an existing holiday on the same date is unchanged, even under another type", () => {
    const r = planExcelDiff(classified({ holidays: [holiday()] }), existing({ holidays: [H({ type: "Custom" })] })).holidays[0];
    expect(r.status).toBe("unchanged");
    expect(r.changes).toEqual([]);
    expect(r.op).toBeNull();
  });

  it("new observances start unticked", () => {
    const r = planExcelDiff(classified({ holidays: [holiday()] }), existing()).holidays[0];
    expect(r.status).toBe("new");
    expect(r.op).toBe("create");
    expect(r.defaultSelected).toBe(false);
  });
});

describe("checklist", () => {
  it("matches by item text and section: unchanged, new (ticked)", () => {
    const plan = planExcelDiff(classified({ checklist: [item(), item({ item: "Print the flyers" })] }), existing({ checklist: [C()] }));
    expect(plan.checklist.map((r) => [r.status, r.defaultSelected])).toEqual([["unchanged", false], ["new", true]]);
  });

  it("a different status is 'changed', old -> new, never ticked", () => {
    const r = planExcelDiff(classified({ checklist: [item({ status: "Done" })] }), existing({ checklist: [C()] })).checklist[0];
    expect(r.status).toBe("changed");
    expect(r.changes).toEqual([{ field: "status", from: "Not Started", to: "Done" }]);
    expect(r.op).toBe("update");
    expect(r.defaultSelected).toBe(false);
  });

  it("a status the user already advanced is flagged when the workbook would set it back", () => {
    const r = planExcelDiff(classified({ checklist: [item({ status: "Not Started" })] }), existing({ checklist: [C({ status: "In Progress" })] })).checklist[0];
    expect(r.status).toBe("changed");
    expect(r.flags.map((f) => f.code)).toContain("status-advanced");
    expect(r.defaultSelected).toBe(false);
  });

  it("the same item under another section matches weakly", () => {
    const r = planExcelDiff(classified({ checklist: [item()] }), existing({ checklist: [C({ category: "Other section" })] })).checklist[0];
    expect(r.matchKind).toBe("qualifier");
    expect(r.flags.map((f) => f.code)).toContain("weak-match");
  });
});

describe("months, summary, missing, determinism", () => {
  const build = () =>
    planExcelDiff(
      classified({
        events: [ev({ date: "2026-03-02" }), ev({ date: "2026-04-06", name: "Y: April Thing", event_time: "10:00:00" })],
        seasons: [season(), season({ name: "May Camp", category: "Ministry Season", start_date: "2026-05-01", end_date: "2026-05-04" })],
        holidays: [holiday()],
        checklist: [item()],
      }),
      existing({
        events: [exRow({ recurring: "Weekly" }), exRow({ name: "Y: Gone Event", event_date: "2026-03-20", event_time: "09:00:00" }), exRow({ name: "Elsewhere", level: "Other", event_date: "2026-03-21" }), exRow({ name: "Next Year", event_date: "2027-03-01" })],
        seasons: [S(), S({ name: "Old Exams", category: "Exam Period", start_date: "2026-06-01", end_date: "2026-06-05" })],
        holidays: [H({ holiday_date: "2026-09-01", name: "Other Observance" }), H({ holiday_date: "2026-01-01", name: "New Year's Day", type: "National (SG Public Holiday)" })],
        checklist: [C({ item: "Not in workbook" }), C({ item: "Different section", category: "Unrelated" })],
      })
    );

  it("groups rows by month, sorted", () => {
    const { months } = build();
    expect(months.map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(months[0].eventRowIds).toHaveLength(1);
    expect(months[0].holidayRowIds).toHaveLength(1);
    expect(months[0].seasonRowIds).toHaveLength(1);
    expect(months[2].seasonRowIds).toHaveLength(1);
  });

  it("counts per status and per month", () => {
    const { summary } = build();
    expect(summary.events.unchanged).toBe(1);
    expect(summary.events.new).toBe(1);
    expect(summary.total.new + summary.total.unchanged + summary.total.changed + summary.total["possible-duplicate"]).toBe(6);
    expect(summary.byMonth.map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(summary.defaultSelected).toBe(summary.events.new + summary.seasons.new + summary.checklist.new);
  });

  it("lists missing rows only within the workbook's year and what it covers", () => {
    const { missingFromWorkbook: m } = build();
    expect(m.events.map((e) => e.name)).toContain("Y: Gone Event");
    expect(m.events.map((e) => e.name)).not.toContain("Elsewhere"); // a level the workbook never mentions
    expect(m.events.map((e) => e.name)).not.toContain("Next Year"); // another year (outside the expanded range too)
    expect(m.seasons.map((s) => s.name)).toEqual([]); // 'Exam Period' is not a category in the workbook
    expect(m.holidays.map((h) => h.name)).toEqual(["Other Observance"]);
    expect(m.checklist.map((c) => c.name)).toEqual(["Not in workbook"]);
  });

  it("caps the missing lists but still counts them", () => {
    const many = Array.from({ length: 10 }, (_, i) => C({ item: `Extra ${i}` }));
    const plan = planExcelDiff(classified({ checklist: [item()] }), existing({ checklist: [C(), ...many] }), { missingLimit: 3 });
    expect(plan.missingFromWorkbook.checklist).toHaveLength(3);
    expect(plan.summary.missing.checklist).toBe(10);
  });

  it("is deterministic, JSON-safe and does not mutate its input", () => {
    const input = classified({ events: [ev()], seasons: [season()], holidays: [holiday()], checklist: [item()] });
    const ex = existing({ events: [exRow()], seasons: [S()] });
    const snapshot = JSON.stringify([input, ex]);
    const a = planExcelDiff(input, ex);
    const b = planExcelDiff(input, ex);
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(JSON.stringify([input, ex])).toBe(snapshot);
  });

  it("an empty workbook gives an empty plan", () => {
    const plan = planExcelDiff(classified({ docYear: null }), existing());
    expect(plan.months).toEqual([]);
    expect(plan.summary.defaultSelected).toBe(0);
  });
});
