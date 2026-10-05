import { CHECKLIST_STATUSES, GATHERING_TYPES } from "../constants";
import { isValidDateStr, MAX_YEAR, MIN_YEAR } from "../dates";
import { isIsoTimestamp, validateSelection } from "../schedules/applyValidation";
import type { CleanImportRow, ImportRowInput } from "../schedules/applyValidation";
import { cleanNotes, cleanText } from "../schedules/text";
import { computeDuration } from "../timeMath";
import type { ChecklistFormValues, ChecklistStatus, EventType, GatheringType } from "../types";
import type { EventFormValues } from "../actions";
import { MAX_EXCEL_APPLY_ROWS } from "./limits";

// Pure checks for "Apply Excel import". The Server Action never trusts the
// browser: the whole selection is validated here, before the first write, and
// one bad row rejects the lot. Season and holiday rows go through the same
// validateSelection as the Word importer, so the rules cannot drift apart.

export const MAX_EVENT_NAME = 120;
export const MAX_LOCATION = 120;
export const MAX_PERSON = 120;
export const MAX_NOTES = 500;
export const MAX_CHECKLIST_TEXT = 200;

export type ExcelRowKind = "event" | "season" | "holiday" | "checklist";

export interface ExcelApplyRow {
  kind: ExcelRowKind;
  op: "create" | "update";
  /** Existing row id (a UUID); required for "update". */
  id?: string;
  /** The existing row's updated_at when the plan was built; required for "update" (optimistic lock). */
  expectedUpdatedAt?: string;
  /** Kind-specific; see the *Values interfaces. Season/holiday use the Word importer's ImportRowInput.values. */
  values: Record<string, unknown>;
}

/** What an event row carries. Recurrence is never sent: imported events are always single occurrences. */
export interface EventApplyValues {
  name: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  level: string;
  location: string | null;
  notes: string | null;
  event_type: EventType;
  gathering_type: GatheringType | null;
  preacher_name: string | null;
  pastoral_youth: boolean;
  pastoral_poly: boolean;
  pastoral_uni: boolean;
  pastoral_adults: boolean;
}

export interface ChecklistApplyValues {
  category: string;
  item: string;
  status: ChecklistStatus;
  notes: string | null;
}

/** An update changes only these event columns, and only the ones supplied (never name, date, owner, recurrence). */
export type EventPatch = Partial<Pick<EventFormValues, "event_time" | "end_time" | "duration_minutes" | "level" | "notes">>;
/** An update changes only status and notes of a checklist item. */
export type ChecklistPatch = Partial<Pick<ChecklistFormValues, "status" | "notes">>;

export type CleanExcelRow =
  | { kind: "event"; op: "create"; values: EventFormValues }
  | { kind: "event"; op: "update"; id: string; expectedUpdatedAt: string; values: EventPatch }
  | { kind: "checklist"; op: "create"; values: ChecklistFormValues }
  | { kind: "checklist"; op: "update"; id: string; expectedUpdatedAt: string; values: ChecklistPatch }
  | (CleanImportRow & { kind: "season" | "holiday" });

/** What the Server Action looked up before validating (one query each). */
export interface ExcelApplyContext {
  /** Names in the levels table. */
  levelNames: readonly string[];
  /** Existing event id (lower case) -> its `recurring` value, for the ids an update names. */
  eventRecurring: ReadonlyMap<string, string>;
  /** Existing event id (lower case) -> saved start/end time, for the ids an update names. */
  eventTimes: ReadonlyMap<string, { event_time: string | null; end_time: string | null }>;
  /** eventDupKey of every saved event on a date a create row uses (fresh read). */
  existingEventKeys: ReadonlySet<string>;
  /** checklistDupKey of every saved checklist item (fresh read). */
  existingChecklistKeys: ReadonlySet<string>;
}

export type ExcelSelectionCheck = { ok: true; rows: CleanExcelRow[] } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const dateOk = (s: unknown): s is string =>
  isValidDateStr(s) && Number(s.slice(0, 4)) >= MIN_YEAR && Number(s.slice(0, 4)) <= MAX_YEAR;

/** 'HH:mm' or 'HH:mm:ss' -> 'HH:mm:ss'; null for blank; undefined when not a time. */
function normaliseTime(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const m = TIME_RE.exec(v.trim());
  return m ? `${m[1]}:${m[2]}:${m[3] ?? "00"}` : undefined;
}

/** Identity of an event for the "already exists" check: normalised name + date + start time. */
export function eventDupKey(name: string, date: string, time: string | null | undefined): string {
  return ["event", cleanText(name).toLowerCase(), date, normaliseTime(time) ?? ""].join("|");
}
export function checklistDupKey(category: string, item: string): string {
  return ["checklist", cleanText(category).toLowerCase(), cleanText(item).toLowerCase()].join("|");
}

/** Dates the event create rows use, so the caller can read the events already saved on them. */
export function eventCreateDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const dates = new Set<string>();
  for (const r of raw.slice(0, MAX_EXCEL_APPLY_ROWS)) {
    const row = r as Partial<ExcelApplyRow> | null;
    const d = row?.values?.event_date;
    if (row && row.kind === "event" && row.op === "create" && dateOk(d)) dates.add(d);
  }
  return Array.from(dates);
}

/** Ids of the events an update row names, so the caller can look them up before validating. */
export function eventUpdateIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  for (const r of raw.slice(0, MAX_EXCEL_APPLY_ROWS)) {
    const row = r as Partial<ExcelApplyRow> | null;
    if (row && row.kind === "event" && row.op === "update" && typeof row.id === "string" && UUID_RE.test(row.id)) ids.add(row.id.toLowerCase());
  }
  return Array.from(ids);
}

const optText = (v: unknown, max: number): { ok: true; value: string | null } | { ok: false } => {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = cleanText(v);
  return t.length > max ? { ok: false } : { ok: true, value: t || null };
};
const optNotes = (v: unknown): { ok: true; value: string | null } | { ok: false } => {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = cleanNotes(v);
  return t.length > MAX_NOTES ? { ok: false } : { ok: true, value: t || null };
};

/** Plain-language problem with an event's values, or null. Returns the cleaned values through `out`. */
function checkEvent(v: Record<string, unknown>, ctx: ExcelApplyContext, op: "create" | "update", id: string | undefined, out: { create?: EventFormValues; patch?: EventPatch }): string | null {
  const wanted = typeof v.level === "string" ? v.level.trim().toLowerCase() : "";
  const levelCanon = wanted ? ctx.levelNames.find((n) => n.toLowerCase() === wanted) : undefined;
  const start = normaliseTime(v.event_time);
  const end = normaliseTime(v.end_time);
  if (start === undefined) return "The start time is not a valid time.";
  if (end === undefined) return "The end time is not a valid time.";
  if (end && !start) return "An end time needs a start time.";
  if (start && end && end <= start) return "The end time must be after the start time.";
  const duration = start && end ? computeDuration(start.slice(0, 5), end.slice(0, 5)) : null;
  const notes = optNotes(v.notes);
  if (!notes.ok) return `Notes must be text of ${MAX_NOTES} characters or fewer.`;

  if (op === "update") {
    // Only fields the row supplies are changed; a blank never erases what is already saved.
    if (v.level !== undefined && v.level !== null && v.level !== "" && !levelCanon) return "That level does not exist in the calendar.";
    if (start && !end) {
      // A new start with no new end is checked against the end already saved.
      const savedEnd = normaliseTime(ctx.eventTimes.get((id ?? "").toLowerCase())?.end_time);
      if (savedEnd && savedEnd <= start) return `The new start time is not before the end time already saved (${savedEnd.slice(0, 5)}).`;
    }
    const patch: EventPatch = {};
    if (start) patch.event_time = start;
    if (end) {
      patch.end_time = end;
      patch.duration_minutes = duration;
    }
    if (levelCanon) patch.level = levelCanon;
    if (notes.value !== null) patch.notes = notes.value;
    if (Object.keys(patch).length === 0) return "There is nothing to change.";
    out.patch = patch;
    return null;
  }

  const name = typeof v.name === "string" ? cleanText(v.name) : "";
  if (!name) return "Give it a name.";
  if (name.length > MAX_EVENT_NAME) return `The name must be ${MAX_EVENT_NAME} characters or fewer.`;
  if (!dateOk(v.event_date)) return `The date is not a valid date between ${MIN_YEAR} and ${MAX_YEAR}.`;
  if (!levelCanon) return "Pick a level that exists in the calendar.";
  const location = optText(v.location, MAX_LOCATION);
  if (!location.ok) return `The location must be text of ${MAX_LOCATION} characters or fewer.`;
  if (v.event_type !== "Event" && v.event_type !== "Gathering") return "Pick the kind of event (Event or Gathering).";
  const gt = v.gathering_type ?? null;
  if (gt !== null && !(GATHERING_TYPES as unknown[]).includes(gt)) return "The Gathering type is not valid.";
  const preacher = optText(v.preacher_name, MAX_PERSON);
  if (!preacher.ok) return `The preacher must be text of ${MAX_PERSON} characters or fewer.`;
  for (const k of ["pastoral_youth", "pastoral_poly", "pastoral_uni", "pastoral_adults"] as const) {
    if (v[k] !== undefined && typeof v[k] !== "boolean") return "The focus groups must be true or false.";
  }
  out.create = {
    name,
    event_date: v.event_date,
    end_date: null,
    event_time: start,
    end_time: end,
    duration_minutes: duration,
    level: levelCanon,
    location: location.value,
    recurring: "None",
    repeat_until: null,
    notes: notes.value,
    event_type: v.event_type,
    pastoral_youth: v.pastoral_youth === true,
    pastoral_poly: v.pastoral_poly === true,
    pastoral_uni: v.pastoral_uni === true,
    pastoral_adults: v.pastoral_adults === true,
    gathering_type: v.event_type === "Gathering" ? (gt as GatheringType | null) : null,
    series: null,
    preacher_name: preacher.value,
    sermon_title: null,
    theme: null,
  };
  return null;
}

function checkChecklist(v: Record<string, unknown>, op: "create" | "update", out: { create?: ChecklistFormValues; patch?: ChecklistPatch }): string | null {
  if (typeof v.status !== "string" || !(CHECKLIST_STATUSES as string[]).includes(v.status)) return "Pick a status (Not Started, In Progress or Done).";
  const status = v.status as ChecklistStatus;
  const notes = optNotes(v.notes);
  if (!notes.ok) return `Notes must be text of ${MAX_NOTES} characters or fewer.`;
  if (op === "update") {
    out.patch = notes.value !== null ? { status, notes: notes.value } : { status };
    return null;
  }
  const item = typeof v.item === "string" ? cleanText(v.item) : "";
  const category = typeof v.category === "string" ? cleanText(v.category) : "";
  if (!item) return "Give the item some text.";
  if (item.length > MAX_CHECKLIST_TEXT) return `The item must be ${MAX_CHECKLIST_TEXT} characters or fewer.`;
  if (!category) return "Give the item a section.";
  if (category.length > MAX_CHECKLIST_TEXT) return `The section must be ${MAX_CHECKLIST_TEXT} characters or fewer.`;
  out.create = { category, item, status, target_month: null, notes: notes.value, linked_event_id: null, auto_check_type: null };
  return null;
}

/** Validates the WHOLE selection before anything is written. */
export function validateExcelSelection(raw: unknown, ctx: ExcelApplyContext): ExcelSelectionCheck {
  if (!Array.isArray(raw)) return { ok: false, error: "Nothing to import." };
  if (raw.length === 0) return { ok: false, error: "No rows were selected." };
  if (raw.length > MAX_EXCEL_APPLY_ROWS) {
    return { ok: false, error: `That is more than ${MAX_EXCEL_APPLY_ROWS} rows at once. Import in more than one go.` };
  }

  const rows: CleanExcelRow[] = [];
  const seenUpdates = new Set<string>();
  const seenCreates = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Partial<ExcelApplyRow> | null;
    const v = r && typeof r === "object" && r.values && typeof r.values === "object" && !Array.isArray(r.values) ? r.values : null;
    const label = v && typeof v.name === "string" ? v.name : v && typeof v.item === "string" ? v.item : "";
    const shown = cleanText(label).slice(0, 60);
    const where = `Row ${i + 1}${shown ? ` "${shown}"` : ""}`;
    const kinds: unknown[] = ["event", "season", "holiday", "checklist"];
    if (!r || !v || !kinds.includes(r.kind) || (r.op !== "create" && r.op !== "update")) {
      return { ok: false, error: `${where} is not a valid row, so nothing was imported.` };
    }
    if (r.op === "update") {
      if (typeof r.id !== "string" || !UUID_RE.test(r.id)) {
        return { ok: false, error: `${where} is missing the calendar entry it should update, so nothing was imported.` };
      }
      if (!isIsoTimestamp(r.expectedUpdatedAt)) {
        return { ok: false, error: `${where} is missing when the calendar entry was last read. Read the workbook again. Nothing was imported.` };
      }
      const key = `${r.kind}|${r.id.toLowerCase()}`;
      if (seenUpdates.has(key)) return { ok: false, error: `${where} updates the same calendar entry as an earlier row, so nothing was imported.` };
      seenUpdates.add(key);
    }

    if (r.kind === "season" || r.kind === "holiday") {
      // The Word importer's own validation, one row at a time so the message can name THIS selection's row number.
      const one = validateSelection([{ kind: r.kind, op: r.op, id: r.id, expectedUpdatedAt: r.expectedUpdatedAt, values: v } as ImportRowInput]);
      if (!one.ok) return { ok: false, error: one.error.replace(/^Row 1\b/, `Row ${i + 1}`) };
      const clean = one.rows[0];
      if (r.op === "create") {
        const key = [r.kind, clean.values.name.toLowerCase(), r.kind === "holiday" ? (clean.values as { holiday_date: string }).holiday_date : (clean.values as { start_date: string }).start_date, r.kind === "season" ? (clean.values as { end_date: string }).end_date : ""].join("|");
        if (seenCreates.has(key)) return { ok: false, error: `${where} is the same as an earlier row being added, so nothing was imported.` };
        seenCreates.add(key);
      }
      rows.push(clean as CleanExcelRow);
      continue;
    }

    if (r.kind === "event" && r.op === "update") {
      const recurring = ctx.eventRecurring.get((r.id as string).toLowerCase());
      if (recurring === undefined) return { ok: false, error: `${where} is an event that no longer exists, so nothing was imported.` };
      if (recurring !== "None") {
        return { ok: false, error: `${where} is part of a repeating event. Change it in the calendar instead. Nothing was imported.` };
      }
    }

    const out: { create?: EventFormValues; patch?: EventPatch } = {};
    const cout: { create?: ChecklistFormValues; patch?: ChecklistPatch } = {};
    const problem = r.kind === "event" ? checkEvent(v, ctx, r.op, r.id, out) : checkChecklist(v, r.op, cout);
    if (problem) return { ok: false, error: `${where}: ${problem} Nothing was imported.` };

    if (r.op === "create") {
      const c = r.kind === "event" ? (out.create as EventFormValues) : (cout.create as ChecklistFormValues);
      const key =
        r.kind === "event"
          ? eventDupKey((c as EventFormValues).name, (c as EventFormValues).event_date, (c as EventFormValues).event_time)
          : checklistDupKey((c as ChecklistFormValues).category, (c as ChecklistFormValues).item);
      const existing = r.kind === "event" ? ctx.existingEventKeys : ctx.existingChecklistKeys;
      if (existing.has(key)) return { ok: false, error: `${where} is already in the calendar, so nothing was imported.` };
      if (seenCreates.has(key)) return { ok: false, error: `${where} is the same as an earlier row being added, so nothing was imported.` };
      seenCreates.add(key);
      rows.push(r.kind === "event" ? { kind: "event", op: "create", values: out.create as EventFormValues } : { kind: "checklist", op: "create", values: cout.create as ChecklistFormValues });
    } else if (r.kind === "event") {
      rows.push({ kind: "event", op: "update", id: r.id as string, expectedUpdatedAt: r.expectedUpdatedAt as string, values: out.patch as EventPatch });
    } else {
      rows.push({ kind: "checklist", op: "update", id: r.id as string, expectedUpdatedAt: r.expectedUpdatedAt as string, values: cout.patch as ChecklistPatch });
    }
  }
  return { ok: true, rows };
}

export interface ExcelApplyFailure {
  /** 1-based position in the rows of THIS call; the client adds the rows of earlier chunks. */
  row: number;
  name: string;
  message: string;
}

export interface ExcelApplySummary {
  eventsAdded: number;
  eventsUpdated: number;
  seasonsAdded: number;
  seasonsUpdated: number;
  holidaysAdded: number;
  holidaysUpdated: number;
  checklistAdded: number;
  checklistUpdated: number;
  failed: ExcelApplyFailure | null;
  /** Rows of this call after the failed one that were not attempted. */
  notAttempted: number;
}

export const emptyExcelSummary = (): ExcelApplySummary => ({
  eventsAdded: 0, eventsUpdated: 0, seasonsAdded: 0, seasonsUpdated: 0, holidaysAdded: 0, holidaysUpdated: 0, checklistAdded: 0, checklistUpdated: 0,
  failed: null, notAttempted: 0,
});

export function excelSavedCount(s: ExcelApplySummary): number {
  return s.eventsAdded + s.eventsUpdated + s.seasonsAdded + s.seasonsUpdated + s.holidaysAdded + s.holidaysUpdated + s.checklistAdded + s.checklistUpdated;
}

/** Adds the counts of several calls (a chunked Apply) into one summary; `failed` is the first failure. */
export function combineExcelSummaries(parts: ExcelApplySummary[]): ExcelApplySummary {
  const total = emptyExcelSummary();
  for (const p of parts) {
    total.eventsAdded += p.eventsAdded; total.eventsUpdated += p.eventsUpdated;
    total.seasonsAdded += p.seasonsAdded; total.seasonsUpdated += p.seasonsUpdated;
    total.holidaysAdded += p.holidaysAdded; total.holidaysUpdated += p.holidaysUpdated;
    total.checklistAdded += p.checklistAdded; total.checklistUpdated += p.checklistUpdated;
    total.failed ??= p.failed;
    total.notAttempted += p.notAttempted;
  }
  return total;
}

/** Plain-language outcome line for the result panel / failure banner. */
export function describeExcelApply(s: ExcelApplySummary): string {
  const bits: string[] = [];
  const add = (n: number, one: string, many: string, verb: string) => n && bits.push(`${verb} ${n} ${n === 1 ? one : many}`);
  add(s.eventsAdded, "event", "events", "added");
  add(s.eventsUpdated, "event", "events", "updated");
  add(s.seasonsAdded, "season", "seasons", "added");
  add(s.seasonsUpdated, "season", "seasons", "updated");
  add(s.holidaysAdded, "observance", "observances", "added");
  add(s.holidaysUpdated, "observance", "observances", "updated");
  add(s.checklistAdded, "checklist item", "checklist items", "added");
  add(s.checklistUpdated, "checklist item", "checklist items", "updated");
  const done = bits.length ? bits.join(", ") : "nothing saved";
  if (!s.failed) return done.charAt(0).toUpperCase() + done.slice(1) + ".";
  const saved = excelSavedCount(s);
  return `Stopped at row ${s.failed.row} ("${s.failed.name}"): ${s.failed.message} ${
    saved ? `${saved} ${saved === 1 ? "row was" : "rows were"} already saved (${done}) and can be undone.` : "Nothing was saved."
  }${s.notAttempted ? ` ${s.notAttempted} later ${s.notAttempted === 1 ? "row was" : "rows were"} not tried.` : ""}`;
}
