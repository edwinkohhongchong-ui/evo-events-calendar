import type { HolidayRow, SeasonRow } from "../types";
import { isStrongMatch } from "./diff";
import type { DiffStatus, FieldChange, HolidayDiff, MatchKind, ScheduleDiff, SeasonDiff } from "./diff";
import { mergeNotes } from "./text";
import type { Flag, IgnoredLine, ParsedSchedule } from "./types";

// The JSON the parse endpoint returns and the preview renders. Plain strings,
// numbers and booleans only (no Date objects), so it survives JSON.stringify.

export interface PlanExisting {
  name: string;
  /** Season category, or holiday type. */
  category: string;
  start: string;
  end: string;
  notes: string;
  /** The row's optimistic-lock token at the time the document was read; sent back with an update. */
  updatedAt: string | null;
}

export interface PlanDuplicate {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface PlanRow {
  /** Stable id within one response (the planner's key). */
  rowId: string;
  kind: "holiday" | "season";
  status: DiffStatus;
  name: string;
  /** Season category, or holiday type (the table's "Category / Type" column). */
  category: string;
  /** yyyy-MM-dd. A holiday has start === end. */
  start: string;
  end: string;
  notes: string;
  /** Id of the matched existing row; Apply uses it to update instead of add. */
  existingId: string | null;
  existing: PlanExisting | null;
  /** How the existing row was paired with this one; null for a new row. */
  matchKind: MatchKind | null;
  changes: FieldChange[];
  /** The document's note is not in the existing row's notes yet (does not by itself make a row "changed"). */
  notesDiffer: boolean;
  flags: Flag[];
  /** An error-severity flag is present: cannot be applied until the user edits it. */
  invalid: boolean;
  tentative: boolean;
  /** Whether the preview ticks this row at first (see initialSelected). */
  defaultSelected: boolean;
  possibleDuplicates: PlanDuplicate[];
  source: { line: number; text: string };
}

export interface MissingRow {
  id: string;
  name: string;
  category: string;
  start: string;
  end: string;
}

export interface SchedulePlan {
  docYear: number | null;
  title: string | null;
  holidays: PlanRow[];
  seasons: PlanRow[];
  missingFromDocument: { holidays: MissingRow[]; seasons: MissingRow[] };
  ignoredLines: IgnoredLine[];
  issues: Flag[];
}

export const WEAK_MATCH_MESSAGE = "Matched by name only. Check this is the same row before applying.";

/**
 * Ticked at first: something to add or change, no error flag, not a guidance-only row,
 * and not a weak match. A row paired only by name (moved dates, a qualifier) starts
 * unticked so a wrong pairing cannot overwrite a different calendar row by default.
 */
export function initialSelected(
  row: { status: DiffStatus; invalid: boolean; matchKind?: MatchKind | null },
  plannedDefault?: boolean
): boolean {
  if (row.matchKind && !isStrongMatch(row.matchKind)) return false;
  return row.status !== "unchanged" && !row.invalid && plannedDefault !== false;
}

function withMatchFlag(flags: Flag[], kind: MatchKind | undefined, line: number): Flag[] {
  if (!kind || isStrongMatch(kind)) return flags;
  return [...flags, { code: "weak-match", severity: "warn", message: WEAK_MATCH_MESSAGE, row: line }];
}

function holidayRow(d: HolidayDiff): PlanRow {
  const p = d.planned;
  const e = d.existing;
  return {
    rowId: p.key,
    kind: "holiday",
    status: d.status,
    name: p.name,
    category: p.type,
    start: p.date,
    end: p.date,
    notes: "",
    existingId: e?.id ?? null,
    existing: e
      ? { name: e.name, category: e.type, start: e.holiday_date, end: e.holiday_date, notes: "", updatedAt: e.updated_at ?? null }
      : null,
    matchKind: d.matchKind ?? null,
    changes: d.changes,
    notesDiffer: false,
    flags: withMatchFlag(p.flags, d.matchKind, p.source.line),
    invalid: p.invalid,
    tentative: p.tentative,
    defaultSelected: initialSelected({ status: d.status, invalid: p.invalid, matchKind: d.matchKind }),
    possibleDuplicates: d.possibleDuplicates.map((x) => ({ id: x.id, name: x.name, start: x.holiday_date, end: x.holiday_date })),
    source: p.source,
  };
}

function seasonRow(d: SeasonDiff): PlanRow {
  const p = d.planned;
  const e = d.existing;
  // An update never replaces hand-written notes: the document's note is appended on a new line
  // (and skipped when the existing note already contains it). See mergeNotes.
  const notes = mergeNotes(e?.notes, p.notes);
  return {
    rowId: p.key,
    kind: "season",
    status: d.status,
    name: p.name,
    category: p.category,
    start: p.start_date,
    end: p.end_date,
    notes,
    existingId: e?.id ?? null,
    existing: e
      ? { name: e.name, category: e.category, start: e.start_date, end: e.end_date, notes: e.notes ?? "", updatedAt: e.updated_at ?? null }
      : null,
    matchKind: d.matchKind ?? null,
    // A notes-only difference does not make the row "changed", but it is shown as a reason to look.
    changes: e && d.notesDiffer ? [...d.changes, { field: "notes", from: e.notes ?? "", to: notes }] : d.changes,
    notesDiffer: d.notesDiffer,
    flags: withMatchFlag(p.flags, d.matchKind, p.source.line),
    invalid: p.invalid,
    tentative: p.tentative,
    defaultSelected: initialSelected({ status: d.status, invalid: p.invalid, matchKind: d.matchKind }, p.defaultSelected),
    possibleDuplicates: d.possibleDuplicates.map((x) => ({ id: x.id, name: x.name, start: x.start_date, end: x.end_date })),
    source: p.source,
  };
}

const missingHoliday = (h: HolidayRow): MissingRow => ({ id: h.id, name: h.name, category: h.type, start: h.holiday_date, end: h.holiday_date });
const missingSeason = (s: SeasonRow): MissingRow => ({ id: s.id, name: s.name, category: s.category, start: s.start_date, end: s.end_date });

export function buildSchedulePlan(parsed: ParsedSchedule, diff: ScheduleDiff): SchedulePlan {
  return {
    docYear: parsed.docYear,
    title: parsed.title,
    holidays: diff.holidays.map(holidayRow),
    seasons: diff.seasons.map(seasonRow),
    missingFromDocument: {
      holidays: diff.missingFromDocument.holidays.map(missingHoliday),
      seasons: diff.missingFromDocument.seasons.map(missingSeason),
    },
    ignoredLines: parsed.ignoredLines,
    issues: parsed.issues,
  };
}
