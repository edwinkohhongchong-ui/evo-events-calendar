import { HOLIDAY_TYPES, SEASON_CATEGORIES } from "../constants";
import { normaliseColor } from "../colorStyle";
import { isValidDateStr, MAX_YEAR, MIN_YEAR } from "../dates";
import { MAX_PLAN_ROWS } from "./limits";
import { cleanNotes, cleanText } from "./text";
import type { ColorValue, HolidayFormValues, HolidayType, SeasonCategory } from "../types";

// Pure checks shared by the Apply server action (which never trusts the browser)
// and the preview's inline editor (so the same rules show up live as you type).

export const MAX_IMPORT_ROWS = MAX_PLAN_ROWS;
export const MAX_NAME_LENGTH = 120;
export const MAX_NOTES_LENGTH = 500;

export interface ImportRowInput {
  kind: "holiday" | "season";
  op: "create" | "update";
  /** Existing row id (a UUID); required for "update". */
  id?: string;
  /** The row's updated_at when the document was read; required for "update" (optimistic lock). */
  expectedUpdatedAt?: string;
  values: {
    name?: unknown;
    /** Season category, or holiday type. */
    category?: unknown;
    start?: unknown;
    /** Ignored for holidays (a holiday is one day). */
    end?: unknown;
    notes?: unknown;
    color?: unknown;
  };
}

export interface CleanSeasonValues {
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string | null;
  /** undefined: keep the existing colour on update / pick one on create. */
  color: ColorValue | undefined;
}

export type CleanImportRow =
  | { kind: "holiday"; op: "create" | "update"; id?: string; expectedUpdatedAt?: string; values: HolidayFormValues }
  | { kind: "season"; op: "create" | "update"; id?: string; expectedUpdatedAt?: string; values: CleanSeasonValues };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// What Postgres/PostgREST return for timestamptz, e.g. 2026-03-01T10:00:00.123456+00:00 (or Z).
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}(:?\d{2})?)$/;
export const isIsoTimestamp = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 40 && ISO_TIMESTAMP_RE.test(s) && Number.isFinite(Date.parse(s));

const dateOk = (s: unknown): s is string =>
  isValidDateStr(s) && Number(s.slice(0, 4)) >= MIN_YEAR && Number(s.slice(0, 4)) <= MAX_YEAR;

/** Plain-language problems with one row's values (empty when fine). Used live by the editor. */
export function rowProblems(kind: "holiday" | "season", v: ImportRowInput["values"]): string[] {
  const out: string[] = [];
  const name = typeof v.name === "string" ? cleanText(v.name) : "";
  if (!name) out.push("Give it a name.");
  else if (name.length > MAX_NAME_LENGTH) out.push(`The name must be ${MAX_NAME_LENGTH} characters or fewer.`);

  const options: readonly string[] = kind === "holiday" ? HOLIDAY_TYPES : SEASON_CATEGORIES;
  if (typeof v.category !== "string" || !options.includes(v.category)) {
    out.push(kind === "holiday" ? "Pick a holiday type." : "Pick a category.");
  }

  if (!dateOk(v.start)) out.push(`The ${kind === "holiday" ? "date" : "start date"} is not a valid date between ${MIN_YEAR} and ${MAX_YEAR}.`);
  if (kind === "season") {
    if (!dateOk(v.end)) out.push(`The end date is not a valid date between ${MIN_YEAR} and ${MAX_YEAR}.`);
    else if (dateOk(v.start) && v.end < v.start) out.push("The end date is before the start date.");
  }

  if (v.notes !== undefined && v.notes !== null) {
    if (typeof v.notes !== "string") out.push("Notes must be text.");
    else if (cleanNotes(v.notes).length > MAX_NOTES_LENGTH) out.push(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
  }
  if (kind === "season" && v.color !== undefined && v.color !== null && !normaliseColor(v.color)) {
    out.push("The colour is not valid.");
  }
  return out;
}

export type SelectionCheck = { ok: true; rows: CleanImportRow[] } | { ok: false; error: string };

/** Validates the WHOLE selection before anything is written, so a bad row rejects the lot. */
export function validateSelection(raw: unknown): SelectionCheck {
  if (!Array.isArray(raw)) return { ok: false, error: "Nothing to import." };
  if (raw.length === 0) return { ok: false, error: "No rows were selected." };
  if (raw.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `That is more than ${MAX_IMPORT_ROWS} rows at once. Untick some and import in two goes.` };
  }

  const rows: CleanImportRow[] = [];
  const seenUpdates = new Set<string>();
  const seenCreates = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Partial<ImportRowInput> | null;
    const rawValues = r && typeof r === "object" && r.values && typeof r.values === "object" ? r.values : null;
    // The server is the authority on text: clean first, then validate what will actually be saved.
    const v: ImportRowInput["values"] | null = rawValues && {
      ...rawValues,
      name: typeof rawValues.name === "string" ? cleanText(rawValues.name) : rawValues.name,
      notes: typeof rawValues.notes === "string" ? cleanNotes(rawValues.notes) : rawValues.notes,
    };
    const shownName = v && typeof v.name === "string" && v.name ? ` "${v.name.slice(0, 60)}"` : "";
    const where = `Row ${i + 1}${shownName}`;
    if (!r || !v || (r.kind !== "holiday" && r.kind !== "season") || (r.op !== "create" && r.op !== "update")) {
      return { ok: false, error: `${where} is not a valid row, so nothing was imported.` };
    }
    if (r.op === "update") {
      if (typeof r.id !== "string" || !UUID_RE.test(r.id)) {
        return { ok: false, error: `${where} is missing the calendar entry it should update, so nothing was imported.` };
      }
      if (!isIsoTimestamp(r.expectedUpdatedAt)) {
        return { ok: false, error: `${where} is missing when the calendar entry was last read. Read the document again. Nothing was imported.` };
      }
      const key = `${r.kind}|${r.id.toLowerCase()}`;
      if (seenUpdates.has(key)) {
        return { ok: false, error: `${where} updates the same calendar entry as an earlier row, so nothing was imported.` };
      }
      seenUpdates.add(key);
    }
    const problems = rowProblems(r.kind, v);
    if (problems.length) return { ok: false, error: `${where}: ${problems[0]} Nothing was imported.` };

    if (r.op === "create") {
      const key = [r.kind, (v.name as string).toLowerCase(), v.start, r.kind === "season" ? v.end : ""].join("|");
      if (seenCreates.has(key)) {
        return { ok: false, error: `${where} is the same as an earlier row being added, so nothing was imported.` };
      }
      seenCreates.add(key);
    }

    const name = v.name as string;
    const id = r.op === "update" ? r.id : undefined;
    const expectedUpdatedAt = r.op === "update" ? r.expectedUpdatedAt : undefined;
    if (r.kind === "holiday") {
      rows.push({
        kind: "holiday",
        op: r.op,
        id,
        expectedUpdatedAt,
        values: { name, type: v.category as HolidayType, holiday_date: v.start as string },
      });
    } else {
      const notes = typeof v.notes === "string" ? v.notes : "";
      rows.push({
        kind: "season",
        op: r.op,
        id,
        expectedUpdatedAt,
        values: {
          name,
          category: v.category as SeasonCategory,
          start_date: v.start as string,
          end_date: v.end as string,
          notes: notes || null,
          color: v.color == null ? undefined : (normaliseColor(v.color) ?? undefined),
        },
      });
    }
  }
  return { ok: true, rows };
}

export interface ApplyFailure {
  /** 1-based position in the submitted selection. */
  row: number;
  name: string;
  message: string;
}

export interface ApplySummary {
  holidaysAdded: number;
  holidaysUpdated: number;
  seasonsAdded: number;
  seasonsUpdated: number;
  failed: ApplyFailure | null;
  /** Rows after the failed one that were not attempted. */
  notAttempted: number;
}

export function savedCount(s: ApplySummary): number {
  return s.holidaysAdded + s.holidaysUpdated + s.seasonsAdded + s.seasonsUpdated;
}

/** Plain-language outcome line for the result panel / failure banner. */
export function describeApply(s: ApplySummary): string {
  const bits: string[] = [];
  const add = (n: number, one: string, many: string, verb: string) => n && bits.push(`${verb} ${n} ${n === 1 ? one : many}`);
  add(s.holidaysAdded, "holiday", "holidays", "added");
  add(s.holidaysUpdated, "holiday", "holidays", "updated");
  add(s.seasonsAdded, "season", "seasons", "added");
  add(s.seasonsUpdated, "season", "seasons", "updated");
  const done = bits.length ? bits.join(", ") : "nothing saved";
  if (!s.failed) return done.charAt(0).toUpperCase() + done.slice(1) + ".";
  const saved = savedCount(s);
  return `Stopped at row ${s.failed.row} ("${s.failed.name}"): ${s.failed.message} ${
    saved ? `${saved} ${saved === 1 ? "row was" : "rows were"} already saved (${done}) and can be undone.` : "Nothing was saved."
  }${s.notAttempted ? ` ${s.notAttempted} later ${s.notAttempted === 1 ? "row was" : "rows were"} not tried.` : ""}`;
}
