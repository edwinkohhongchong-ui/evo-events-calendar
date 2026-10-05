import { applyOverrides } from "../overrides";
import { expandEvents } from "../recurrence";
import { parseDateStr } from "../dates";
import { changeList, diffHolidays, diffSeasons, isStrongMatch } from "../schedules/diff";
import type { DiffStatus, FieldChange, MatchKind } from "../schedules/diff";
import { normaliseKeyName } from "../schedules/classify";
import { initialSelected, WEAK_MATCH_MESSAGE } from "../schedules/planRows";
import { cleanNotes, mergeNotes } from "../schedules/text";
import type { ChecklistRow, EventRow, ExceptionRow, HolidayRow, LevelRow, OverrideRow, SeasonRow } from "../types";
import type { ChecklistApplyValues, EventApplyValues, ExcelRowKind } from "./applyValidation";
import { MAX_EVENT_NAME, MAX_NOTES } from "./applyValidation";
import type { ClassifiedExcel, PlanFlag, PlanFlagCode, PlannedChecklist } from "./classifyExcel";
import type { SourceRef } from "./parseCalendarSheets";

// Stage 1c: compares the classified workbook with what the calendar already
// holds and builds the plan the preview renders. Pure and deterministic: no
// clock, no database, no randomness; the result survives JSON.stringify.
// Nothing here writes; the user's ticks decide what Apply receives.
//
// Events are matched against the EXPANDED occurrences of the existing events
// (lib/recurrence.ts then lib/overrides.ts), because the workbook lists every
// occurrence of a repeating event as its own cell. Seasons and holidays reuse
// the Word importer's matcher (lib/schedules/diff.ts).

export type ExcelStatus = DiffStatus | "possible-duplicate";

export type ExcelPlanFlagCode =
  | PlanFlagCode
  | "weak-match"
  | "repeating-event"
  | "possible-duplicate"
  | "level-not-in-calendar"
  | "missing-name"
  | "name-too-long"
  | "notes-trimmed"
  | "status-advanced"
  | "no-update-token";

export interface ExcelPlanFlag {
  code: ExcelPlanFlagCode;
  severity: "warn" | "error";
  message: string;
}

export interface ExcelPlanExisting {
  name: string;
  /** Event level, season category, holiday type or checklist section. */
  category: string;
  start: string;
  end: string;
  time: string | null;
  endTime: string | null;
  notes: string;
  /** The optimistic-lock token to send back with an update. */
  updatedAt: string | null;
  /** The event is an occurrence of a repeating series (cannot be changed from here). */
  repeating: boolean;
}

export interface ExcelPlanDuplicate {
  id: string;
  name: string;
  start: string;
  end: string;
  time: string | null;
}

export type ExcelRowValues = EventApplyValues | ChecklistApplyValues | Record<string, unknown>;

export interface ExcelPlanRow {
  /** Stable id within one plan (the classifier's key). */
  rowId: string;
  kind: ExcelRowKind;
  status: ExcelStatus;
  /** 'yyyy-MM' the row belongs to (events and holidays: their date; seasons: their start); null for checklist rows. */
  month: string | null;
  name: string;
  /** Event level ('' when unknown), season category, holiday type or checklist section. */
  category: string;
  /** yyyy-MM-dd; '' for checklist rows. A holiday and a single-day event have start === end. */
  start: string;
  end: string;
  time: string | null;
  endTime: string | null;
  notes: string;
  /** What Apply would do if ticked: add a row, change the matched row, or nothing (unchanged, or not changeable from here). */
  op: "create" | "update" | null;
  /** Matched existing row (events: the event id; for an occurrence of a repeating event, the series id). */
  existingId: string | null;
  existing: ExcelPlanExisting | null;
  /**
   * How the existing row was paired. Events: 'exact' (same name, date and time) or 'qualifier' (same
   * name and date, different time). Seasons and holidays: as in the Word importer. Only exact and
   * overlap count as strong; everything else starts unticked.
   */
  matchKind: MatchKind | null;
  /** Old -> new, field by field. */
  changes: FieldChange[];
  flags: ExcelPlanFlag[];
  /** An error flag is present: cannot be applied until edited. */
  invalid: boolean;
  /** Whether the preview ticks this row at first. */
  defaultSelected: boolean;
  possibleDuplicates: ExcelPlanDuplicate[];
  source: SourceRef;
  /**
   * The values Apply takes for this row (see ExcelApplyRow.values): the full values for a create, the
   * values to write for an update. The preview edits these and sends them back.
   */
  values: ExcelRowValues;
}

export interface ExcelMissingRow {
  kind: ExcelRowKind;
  id: string;
  name: string;
  category: string;
  start: string;
  end: string;
}

export interface ExcelPlanMonth {
  /** 'yyyy-MM'. */
  month: string;
  eventRowIds: string[];
  seasonRowIds: string[];
  holidayRowIds: string[];
}

export type StatusCounts = Record<ExcelStatus, number>;

export interface ExcelPlanSummary {
  events: StatusCounts;
  seasons: StatusCounts;
  holidays: StatusCounts;
  checklist: StatusCounts;
  total: StatusCounts;
  defaultSelected: number;
  /** Rows carrying at least one flag. */
  flagged: number;
  byMonth: Array<{ month: string; counts: StatusCounts; defaultSelected: number }>;
  missing: { events: number; seasons: number; holidays: number; checklist: number };
}

export interface ExcelPlan {
  docYear: number | null;
  events: ExcelPlanRow[];
  seasons: ExcelPlanRow[];
  holidays: ExcelPlanRow[];
  checklist: ExcelPlanRow[];
  months: ExcelPlanMonth[];
  /** Existing rows the workbook does not mention, limited to its year and to what it covers. Informational only. */
  missingFromWorkbook: { events: ExcelMissingRow[]; seasons: ExcelMissingRow[]; holidays: ExcelMissingRow[]; checklist: ExcelMissingRow[] };
  summary: ExcelPlanSummary;
}

export interface ExcelExisting {
  events: EventRow[];
  overrides?: OverrideRow[];
  exceptions?: ExceptionRow[];
  seasons: SeasonRow[];
  holidays: HolidayRow[];
  checklist: ChecklistRow[];
  levels: LevelRow[];
}

export interface ExcelDiffOptions {
  /** Each "missing from workbook" list is cut to this many rows (default 200). */
  missingLimit?: number;
}

const flag = (code: ExcelPlanFlagCode, severity: "warn" | "error", message: string): ExcelPlanFlag => ({ code, severity, message });
const hasError = (flags: ExcelPlanFlag[]) => flags.some((f) => f.severity === "error");
const hasCode = (flags: ExcelPlanFlag[], code: ExcelPlanFlagCode) => flags.some((f) => f.code === code);
const fromClassified = (flags: PlanFlag[]): ExcelPlanFlag[] => flags.map((f) => ({ code: f.code, severity: f.severity, message: f.message }));
const t5 = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);
const emptyCounts = (): StatusCounts => ({ new: 0, changed: 0, unchanged: 0, "possible-duplicate": 0 });

/**
 * Event names compared with case, punctuation and the 'Y.' / 'Y:' / 'Y -' prefix style ignored:
 * 'Y. QT', 'y: qt' and 'Y: QT (tentative)' are one name. The prefix letters themselves are kept, so
 * 'P: QT' stays a different event.
 */
export function eventNameKey(name: string): string {
  return normaliseKeyName(name)
    .replace(/^([ypua]{1,4})\s*[:.\-–]\s*/, "$1 ")
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, " ")
    .trim();
}

function similarNames(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.includes(s)) return true;
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / (A.size + B.size - inter) >= 0.6;
}

const monthOf = (date: string) => date.slice(0, 7);

// ---------------------------------------------------------------------------
// Events

interface Occ {
  eventId: string;
  name: string;
  key: string;
  date: string;
  time: string | null;
  endTime: string | null;
  level: string;
  notes: string;
  repeating: boolean;
  updatedAt: string | null;
  claimed: boolean;
}

function existingOccurrences(existing: ExcelExisting, start: string, end: string): Occ[] {
  const exceptions = new Map<string, Set<string>>();
  for (const x of existing.exceptions ?? []) {
    const set = exceptions.get(x.event_id) ?? new Set<string>();
    set.add(x.original_date);
    exceptions.set(x.event_id, set);
  }
  const expanded = expandEvents(existing.events, parseDateStr(start), parseDateStr(end), exceptions);
  const byId = new Map(existing.events.map((e) => [e.id, e]));
  const occs = applyOverrides(expanded, existing.overrides ?? [], byId, start, end);
  return occs
    .filter((o) => o.occurrenceDate >= start && o.occurrenceDate <= end)
    .map((o) => ({
      eventId: o.event.id,
      name: o.event.name,
      key: eventNameKey(o.event.name),
      date: o.occurrenceDate,
      time: o.startTime,
      endTime: o.endTime,
      level: o.event.level,
      notes: o.event.notes ?? "",
      repeating: o.event.recurring !== "None",
      updatedAt: o.event.updated_at ?? null,
      claimed: false,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.eventId.localeCompare(b.eventId));
}

const minutes = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);

function planEvents(classified: ClassifiedExcel, existing: ExcelExisting, occs: Occ[]): ExcelPlanRow[] {
  const levelByLower = new Map(existing.levels.map((l) => [l.name.toLowerCase(), l.name]));
  const byDate = new Map<string, Occ[]>();
  for (const o of occs) byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);

  const planned = classified.events;
  const keys = planned.map((p) => eventNameKey(p.name));
  const match = new Map<number, { occ: Occ; kind: "exact" | "qualifier" }>();
  const free = (i: number, o: Occ) => !o.claimed && o.key === keys[i];
  const claim = (i: number, o: Occ, kind: "exact" | "qualifier") => {
    o.claimed = true;
    match.set(i, { occ: o, kind });
  };
  // Pass 1: same name, date and start time. Pass 2: the workbook gave no time, so any time of that name
  // fits. Pass 3: same name and date at another time, nearest first: a weak match (unticked).
  planned.forEach((p, i) => {
    const hit = (byDate.get(p.date) ?? []).find((o) => free(i, o) && t5(o.time) === t5(p.event_time));
    if (hit) claim(i, hit, "exact");
  });
  planned.forEach((p, i) => {
    if (match.has(i) || p.event_time !== null) return;
    const hit = (byDate.get(p.date) ?? []).find((o) => free(i, o));
    if (hit) claim(i, hit, "exact");
  });
  planned.forEach((p, i) => {
    if (match.has(i)) return;
    const hits = (byDate.get(p.date) ?? []).filter((o) => free(i, o));
    hits.sort((a, b) => Math.abs(minutes(a.time) - minutes(p.event_time)) - Math.abs(minutes(b.time) - minutes(p.event_time)));
    if (hits[0]) claim(i, hits[0], "qualifier");
  });

  return planned.map((p, i) => {
    const m = match.get(i);
    const flags = fromClassified(p.flags);
    const name = p.name.trim();
    if (!name && !hasCode(flags, "no-name")) flags.push(flag("missing-name", "error", "This event has no name."));
    else if (name.length > MAX_EVENT_NAME) flags.push(flag("name-too-long", "error", `The name is longer than ${MAX_EVENT_NAME} characters; shorten it.`));

    // A level must exist in the levels table; a hint that is not one of them is dropped, never guessed.
    const canonical = p.level ? levelByLower.get(p.level.trim().toLowerCase()) : undefined;
    const level = canonical ?? "";
    if (p.level && !canonical) {
      flags.push(flag("level-not-in-calendar", "warn", `The level "${p.level}" does not exist in the calendar; pick one.`));
    }
    if (!level && !hasCode(flags, "level-unknown") && !hasCode(flags, "level-not-in-calendar")) {
      flags.push(flag("level-unknown", "warn", "Could not tell which level this event is for; pick one."));
    }

    let notes = cleanNotes(p.notes);
    if (notes.length > MAX_NOTES) {
      notes = notes.slice(0, MAX_NOTES);
      flags.push(flag("notes-trimmed", "warn", `The notes were longer than ${MAX_NOTES} characters and have been cut.`));
    }

    let status: ExcelStatus = "new";
    let op: ExcelPlanRow["op"] = "create";
    let existingPlan: ExcelPlanExisting | null = null;
    let existingId: string | null = null;
    let changes: FieldChange[] = [];
    let duplicates: ExcelPlanDuplicate[] = [];
    let matchKind: MatchKind | null = null;
    let rowNotes = notes;
    let weak = false;

    if (m) {
      const o = m.occ;
      matchKind = m.kind;
      weak = m.kind !== "exact";
      rowNotes = mergeNotes(o.notes, notes);
      const pairs: Array<[string, string, string]> = [];
      if (p.event_time !== null) pairs.push(["time", t5(o.time) ?? "", t5(p.event_time) ?? ""]);
      if (p.end_time !== null) pairs.push(["end_time", t5(o.endTime) ?? "", t5(p.end_time) ?? ""]);
      if (notes && !o.notes.includes(notes)) pairs.push(["notes", o.notes, rowNotes]);
      if (level && level.toLowerCase() !== o.level.toLowerCase()) pairs.push(["level", o.level, level]);
      changes = changeList(pairs);
      status = changes.length ? "changed" : "unchanged";
      existingId = o.eventId;
      existingPlan = { name: o.name, category: o.level, start: o.date, end: o.date, time: t5(o.time), endTime: t5(o.endTime), notes: o.notes, updatedAt: o.updatedAt, repeating: o.repeating };
      op = status === "changed" ? "update" : null;
      if (op === "update" && o.repeating) {
        op = null;
        flags.push(flag("repeating-event", "warn", "This is part of a repeating event. Change it in the calendar; the import will not touch the series."));
      } else if (op === "update" && !o.updatedAt) {
        op = null;
        flags.push(flag("no-update-token", "warn", "This event has no edit marker, so it cannot be updated from here."));
      }
      if (weak) flags.push(flag("weak-match", "warn", WEAK_MATCH_MESSAGE));
    } else {
      const sameDay = (byDate.get(p.date) ?? []).filter((o) => !o.claimed);
      const similar = sameDay.filter((o) => similarNames(o.key, keys[i]) || (t5(o.time) !== null && t5(o.time) === t5(p.event_time)));
      if (similar.length) {
        status = "possible-duplicate";
        duplicates = similar.map((o) => ({ id: o.eventId, name: o.name, start: o.date, end: o.date, time: t5(o.time) }));
        flags.push(flag("possible-duplicate", "warn", "The calendar already has a similar event on this day. Check it is not the same one before adding."));
      }
    }

    const invalid = hasError(flags);
    const known = level !== "";
    const values: EventApplyValues = {
      name,
      event_date: p.date,
      event_time: p.event_time,
      end_time: p.end_time,
      level,
      location: null,
      notes: rowNotes || null,
      event_type: p.event_type,
      gathering_type: p.gathering_type,
      preacher_name: p.preacher_name,
      pastoral_youth: p.pastoral_youth,
      pastoral_poly: p.pastoral_poly,
      pastoral_uni: p.pastoral_uni,
      pastoral_adults: p.pastoral_adults,
    };
    return {
      rowId: p.key,
      kind: "event" as const,
      status,
      month: monthOf(p.date),
      name,
      category: level,
      start: p.date,
      end: p.date,
      time: t5(p.event_time),
      endTime: t5(p.end_time),
      notes: rowNotes,
      op,
      existingId,
      existing: existingPlan,
      matchKind,
      changes,
      flags,
      invalid,
      defaultSelected: status === "new" && !invalid && known && p.defaultSelected && !weak,
      possibleDuplicates: duplicates,
      source: p.source,
      values,
    };
  });
}

// ---------------------------------------------------------------------------
// Seasons and holidays

function planSeasons(classified: ClassifiedExcel, existing: SeasonRow[]): { rows: ExcelPlanRow[]; matched: Set<string> } {
  const diffs = diffSeasons(classified.seasons, existing);
  const matched = new Set<string>();
  const rows = diffs.map((d): ExcelPlanRow => {
    const p = d.planned;
    const e = d.existing;
    const flags = fromClassified(p.flags);
    if (d.matchKind && !isStrongMatch(d.matchKind)) flags.push(flag("weak-match", "warn", WEAK_MATCH_MESSAGE));
    if (d.possibleDuplicates.length) flags.push(flag("possible-duplicate", "warn", "The calendar already has a similar season. Check it is not the same one before adding."));
    if (p.category === "Other" && !hasCode(flags, "season-category-unknown")) {
      flags.push(flag("season-category-unknown", "warn", "Could not tell what kind of season this is; it is set to Other."));
    }
    const notes = mergeNotes(e?.notes, p.notes);
    const changes = e && d.notesDiffer ? [...d.changes, { field: "notes", from: e.notes ?? "", to: notes }] : d.changes;
    if (e) matched.add(e.id);
    const invalid = hasError(flags);
    const op: ExcelPlanRow["op"] = !e ? "create" : d.status === "changed" ? "update" : null;
    const values: Record<string, unknown> = { name: p.name, category: p.category, start: p.start_date, end: p.end_date, notes };
    if (!e) values.color = p.color;
    return {
      rowId: p.key,
      kind: "season",
      status: d.status,
      month: monthOf(p.start_date),
      name: p.name,
      category: p.category,
      start: p.start_date,
      end: p.end_date,
      time: null,
      endTime: null,
      notes,
      op,
      existingId: e?.id ?? null,
      existing: e ? { name: e.name, category: e.category, start: e.start_date, end: e.end_date, time: null, endTime: null, notes: e.notes ?? "", updatedAt: e.updated_at ?? null, repeating: false } : null,
      matchKind: d.matchKind ?? null,
      changes,
      flags,
      invalid,
      defaultSelected: initialSelected({ status: d.status, invalid, matchKind: d.matchKind }, p.defaultSelected) && p.category !== "Other" && d.possibleDuplicates.length === 0,
      possibleDuplicates: d.possibleDuplicates.map((x) => ({ id: x.id, name: x.name, start: x.start_date, end: x.end_date, time: null })),
      source: p.source,
      values,
    };
  });
  return { rows, matched };
}

function planHolidays(classified: ClassifiedExcel, existing: HolidayRow[]): { rows: ExcelPlanRow[]; matched: Set<string> } {
  const diffs = diffHolidays(classified.holidays, existing);
  const matched = new Set<string>();
  const rows = diffs.map((d): ExcelPlanRow => {
    const p = d.planned;
    const e = d.existing;
    const flags = fromClassified(p.flags);
    if (d.matchKind && !isStrongMatch(d.matchKind)) flags.push(flag("weak-match", "warn", WEAK_MATCH_MESSAGE));
    // The workbook only knows these as observances: an existing holiday on the same day is the same day, whatever its type.
    const changes = d.changes.filter((c) => c.field !== "type");
    const status: ExcelStatus = !e ? "new" : changes.length ? "changed" : "unchanged";
    if (e) matched.add(e.id);
    const invalid = hasError(flags);
    return {
      rowId: p.key,
      kind: "holiday",
      status,
      month: monthOf(p.date),
      name: p.name,
      category: p.type,
      start: p.date,
      end: p.date,
      time: null,
      endTime: null,
      notes: "",
      op: !e ? "create" : status === "changed" ? "update" : null,
      existingId: e?.id ?? null,
      existing: e ? { name: e.name, category: e.type, start: e.holiday_date, end: e.holiday_date, time: null, endTime: null, notes: "", updatedAt: e.updated_at ?? null, repeating: false } : null,
      matchKind: d.matchKind ?? null,
      changes,
      flags,
      invalid,
      // Observances start unticked: they are a suggestion, not something the calendar needs.
      defaultSelected: false,
      possibleDuplicates: d.possibleDuplicates.map((x) => ({ id: x.id, name: x.name, start: x.holiday_date, end: x.holiday_date, time: null })),
      source: p.source,
      values: { name: p.name, category: e && status === "changed" ? e.type : p.type, start: p.date },
    };
  });
  return { rows, matched };
}

// ---------------------------------------------------------------------------
// Checklist

function planChecklist(planned: PlannedChecklist[], existing: ChecklistRow[]): { rows: ExcelPlanRow[]; matched: Set<string> } {
  const claimed = new Set<string>();
  const rows = planned.map((c): ExcelPlanRow => {
    const item = normaliseKeyName(c.item);
    const cat = normaliseKeyName(c.category);
    const free = existing.filter((e) => !claimed.has(e.id) && normaliseKeyName(e.item) === item);
    let e = free.find((x) => normaliseKeyName(x.category) === cat);
    let kind: MatchKind | null = e ? "exact" : null;
    if (!e && free.length === 1) {
      e = free[0];
      kind = "qualifier";
    }
    const flags = fromClassified(c.flags);
    let status: ExcelStatus = "new";
    let changes: FieldChange[] = [];
    let notes = c.notes;
    if (e) {
      claimed.add(e.id);
      notes = mergeNotes(e.notes, c.notes);
      const pairs: Array<[string, string, string]> = [["status", e.status, c.status]];
      if (c.notes && !(e.notes ?? "").includes(c.notes)) pairs.push(["notes", e.notes ?? "", notes]);
      changes = changeList(pairs);
      status = changes.length ? "changed" : "unchanged";
      if (kind === "qualifier") flags.push(flag("weak-match", "warn", `Matched by the item text only; it is under "${e.category}" in the calendar.`));
      if (changes.some((x) => x.field === "status") && e.status !== "Not Started" && c.status === "Not Started") {
        flags.push(flag("status-advanced", "warn", `The calendar already has this as ${e.status}; the workbook still says Not Started.`));
      }
    }
    const invalid = hasError(flags);
    const values: ChecklistApplyValues = { category: e ? e.category : c.category, item: c.item, status: c.status, notes: notes || null };
    return {
      rowId: c.key,
      kind: "checklist",
      status,
      month: null,
      name: c.item,
      category: c.category,
      start: "",
      end: "",
      time: null,
      endTime: null,
      notes,
      op: !e ? "create" : status === "changed" ? "update" : null,
      existingId: e?.id ?? null,
      existing: e ? { name: e.item, category: e.category, start: "", end: "", time: null, endTime: null, notes: e.notes ?? "", updatedAt: null, repeating: false } : null,
      matchKind: kind,
      changes,
      flags,
      invalid,
      // A changed row is never ticked: it would overwrite progress someone already recorded.
      defaultSelected: status === "new" && !invalid && c.defaultSelected,
      possibleDuplicates: [],
      source: c.source,
      values,
    };
  });
  return { rows, matched: claimed };
}

// ---------------------------------------------------------------------------

function groupByMonth(events: ExcelPlanRow[], seasons: ExcelPlanRow[], holidays: ExcelPlanRow[]): ExcelPlanMonth[] {
  const months = new Map<string, ExcelPlanMonth>();
  const get = (m: string) => {
    let x = months.get(m);
    if (!x) months.set(m, (x = { month: m, eventRowIds: [], seasonRowIds: [], holidayRowIds: [] }));
    return x;
  };
  for (const r of events) get(r.month as string).eventRowIds.push(r.rowId);
  for (const r of seasons) get(r.month as string).seasonRowIds.push(r.rowId);
  for (const r of holidays) get(r.month as string).holidayRowIds.push(r.rowId);
  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function count(rows: ExcelPlanRow[]): StatusCounts {
  const c = emptyCounts();
  for (const r of rows) c[r.status]++;
  return c;
}

export function planExcelDiff(classified: ClassifiedExcel, existing: ExcelExisting, opts: ExcelDiffOptions = {}): ExcelPlan {
  const limit = opts.missingLimit ?? 200;
  const dates = classified.events.map((e) => e.date);
  const rangeStart = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : "";
  const rangeEnd = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : "";
  const occs = rangeStart ? existingOccurrences(existing, rangeStart, rangeEnd) : [];

  const events = planEvents(classified, existing, occs);
  const seasonPlan = planSeasons(classified, existing.seasons);
  const holidayPlan = planHolidays(classified, existing.holidays);
  const checklistPlan = planChecklist(classified.checklist, existing.checklist);
  const seasons = seasonPlan.rows;
  const holidays = holidayPlan.rows;
  const checklist = checklistPlan.rows;

  // Missing-from-workbook: informational, limited to the workbook's year and to what the workbook covers.
  const year = classified.docYear;
  const yearStart = year === null ? "" : `${year}-01-01`;
  const yearEnd = year === null ? "" : `${year}-12-31`;
  const cut = <T>(rows: T[]) => rows.slice(0, limit);
  const levelsCovered = new Set(events.map((r) => r.category.toLowerCase()).filter(Boolean));
  const missingEvents: ExcelMissingRow[] = year === null ? [] : occs
    .filter((o) => !o.claimed && o.date >= yearStart && o.date <= yearEnd && levelsCovered.has(o.level.toLowerCase()))
    .map((o) => ({ kind: "event" as const, id: o.eventId, name: o.name, category: o.level, start: o.date, end: o.date }));
  const seasonCats = new Set(seasons.map((r) => r.category));
  const missingSeasons: ExcelMissingRow[] = year === null ? [] : existing.seasons
    .filter((s) => !seasonPlan.matched.has(s.id) && seasonCats.has(s.category) && s.start_date <= yearEnd && s.end_date >= yearStart)
    .map((s) => ({ kind: "season" as const, id: s.id, name: s.name, category: s.category, start: s.start_date, end: s.end_date }));
  const holidayTypes = new Set(holidays.map((r) => r.category));
  const missingHolidays: ExcelMissingRow[] = year === null ? [] : existing.holidays
    .filter((h) => !holidayPlan.matched.has(h.id) && holidayTypes.has(h.type) && h.holiday_date >= yearStart && h.holiday_date <= yearEnd)
    .map((h) => ({ kind: "holiday" as const, id: h.id, name: h.name, category: h.type, start: h.holiday_date, end: h.holiday_date }));
  const sections = new Set(checklist.map((r) => normaliseKeyName(r.category)));
  const missingChecklist: ExcelMissingRow[] = existing.checklist
    .filter((c) => !checklistPlan.matched.has(c.id) && sections.has(normaliseKeyName(c.category)))
    .map((c) => ({ kind: "checklist" as const, id: c.id, name: c.item, category: c.category, start: "", end: "" }));

  const months = groupByMonth(events, seasons, holidays);
  const all = [...events, ...seasons, ...holidays, ...checklist];
  const byMonth = months.map((m) => {
    const ids = new Set([...m.eventRowIds, ...m.seasonRowIds, ...m.holidayRowIds]);
    const rows = all.filter((r) => ids.has(r.rowId));
    return { month: m.month, counts: count(rows), defaultSelected: rows.filter((r) => r.defaultSelected).length };
  });

  return {
    docYear: classified.docYear,
    events,
    seasons,
    holidays,
    checklist,
    months,
    missingFromWorkbook: { events: cut(missingEvents), seasons: cut(missingSeasons), holidays: cut(missingHolidays), checklist: cut(missingChecklist) },
    summary: {
      events: count(events),
      seasons: count(seasons),
      holidays: count(holidays),
      checklist: count(checklist),
      total: count(all),
      defaultSelected: all.filter((r) => r.defaultSelected).length,
      flagged: all.filter((r) => r.flags.length > 0).length,
      byMonth,
      missing: { events: missingEvents.length, seasons: missingSeasons.length, holidays: missingHolidays.length, checklist: missingChecklist.length },
    },
  };
}
