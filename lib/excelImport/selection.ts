import { CHECKLIST_STATUSES } from "../constants";
import { isValidDateStr, MAX_YEAR, MIN_YEAR } from "../dates";
import { isStrongMatch } from "../schedules/diff";
import { rowProblems } from "../schedules/applyValidation";
import { cleanNotes, cleanText } from "../schedules/text";
import type { ExcelPlan, ExcelPlanRow } from "./diffExcel";
import { MAX_CHECKLIST_TEXT, MAX_EVENT_NAME, MAX_NOTES } from "./applyValidation";
import type { ExcelApplyRow, ExcelRowKind } from "./applyValidation";

// Pure helpers behind the Excel import preview: what is ticked, what can be
// ticked, what the inline editor validates, and what is sent to Apply. No
// React, no I/O. The rules mirror applyValidation.ts (the server re-checks all
// of them; these only keep a bad row from being ticked in the first place).

/** What the inline editor can change. Times are 'HH:mm' or ''. */
export interface RowDraft {
  name: string;
  /** Event level, season category or holiday type. For a checklist row it is the (fixed) section. */
  category: string;
  start: string;
  end: string;
  time: string;
  endTime: string;
  notes: string;
  /** Checklist status; unused by other kinds. */
  status: string;
}

export type Drafts = Record<string, RowDraft>;

export interface EditContext {
  /** Level names in the calendar (the API's `levels`). */
  levels: readonly string[];
  docYear: number | null;
}

export const KIND_ORDER: ExcelRowKind[] = ["event", "season", "holiday", "checklist"];
/** Plain-language group names. */
export const KIND_LABEL: Record<ExcelRowKind, string> = { event: "Events", season: "Seasons", holiday: "Observances", checklist: "Checklist" };

/** Flags that are routine in this workbook and not worth counting as "need attention". */
const ROUTINE_FLAGS = new Set(["no-time", "no-done-flag"]);
/** Flags that live editing makes obsolete once the level is chosen. */
const LEVEL_FLAGS = new Set(["level-unknown", "level-not-in-calendar"]);

export const allRows = (plan: ExcelPlan): ExcelPlanRow[] => [...plan.events, ...plan.seasons, ...plan.holidays, ...plan.checklist];
export const rowsOfKind = (plan: ExcelPlan, kind: ExcelRowKind): ExcelPlanRow[] =>
  kind === "event" ? plan.events : kind === "season" ? plan.seasons : kind === "holiday" ? plan.holidays : plan.checklist;

// ---------------------------------------------------------------------------
// Drafts

export function draftFromRow(row: ExcelPlanRow): RowDraft {
  const status = row.kind === "checklist" ? String((row.values as { status?: unknown }).status ?? "Not Started") : "";
  return {
    name: row.name,
    category: row.category,
    start: row.start,
    end: row.end,
    time: row.time ?? "",
    endTime: row.endTime ?? "",
    notes: row.notes,
    status,
  };
}

export const effective = (row: ExcelPlanRow, draft?: RowDraft): RowDraft => draft ?? draftFromRow(row);

// ---------------------------------------------------------------------------
// Validation

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateOk = (s: string) => isValidDateStr(s) && Number(s.slice(0, 4)) >= MIN_YEAR && Number(s.slice(0, 4)) <= MAX_YEAR;

/** Plain-language problems with the values as they would be saved (empty when fine). Same rules as the server. */
export function liveProblems(row: ExcelPlanRow, d: RowDraft, ctx: EditContext): string[] {
  const out: string[] = [];
  const notesLong = cleanNotes(d.notes).length > MAX_NOTES;
  const levelOk = (name: string) => ctx.levels.some((l) => l.toLowerCase() === name.trim().toLowerCase());

  if (row.kind === "event") {
    const create = row.op !== "update";
    if (create) {
      const name = cleanText(d.name);
      if (!name) out.push("Give it a name.");
      else if (name.length > MAX_EVENT_NAME) out.push(`The name must be ${MAX_EVENT_NAME} characters or fewer.`);
      if (!dateOk(d.start)) out.push(`The date is not a valid date between ${MIN_YEAR} and ${MAX_YEAR}.`);
      if (!d.category.trim()) out.push("Pick a level.");
    }
    if (d.category.trim() && !levelOk(d.category)) out.push("That level does not exist in the calendar.");
    if (d.time && !TIME_RE.test(d.time)) out.push("The start time is not a valid time.");
    if (d.endTime && !TIME_RE.test(d.endTime)) out.push("The end time is not a valid time.");
    if (d.endTime && !d.time) out.push("An end time needs a start time.");
    else if (d.time && d.endTime && TIME_RE.test(d.time) && TIME_RE.test(d.endTime) && d.endTime <= d.time) out.push("The end time must be after the start time.");
    if (notesLong) out.push(`Notes must be ${MAX_NOTES} characters or fewer.`);
    if (!create && !d.time && !d.endTime && !d.category.trim() && !cleanNotes(d.notes)) out.push("There is nothing to change.");
  } else if (row.kind === "checklist") {
    const item = cleanText(d.name);
    if (!item) out.push("Give the item some text.");
    else if (item.length > MAX_CHECKLIST_TEXT) out.push(`The item must be ${MAX_CHECKLIST_TEXT} characters or fewer.`);
    if (!(CHECKLIST_STATUSES as string[]).includes(d.status)) out.push("Pick a status (Not Started, In Progress or Done).");
    if (notesLong) out.push(`Notes must be ${MAX_NOTES} characters or fewer.`);
  } else {
    out.push(...rowProblems(row.kind, { name: d.name, category: d.category, start: d.start, end: row.kind === "holiday" ? d.start : d.end, notes: d.notes }));
  }
  return out;
}

/** Why a row with op === null cannot be ticked. */
export function notTickableReason(row: ExcelPlanRow): string {
  const why = row.flags.find((f) => f.code === "repeating-event" || f.code === "no-update-token");
  if (why) return why.message;
  return row.status === "unchanged" ? "Already in the calendar exactly as the workbook has it." : "There is nothing to apply for this row.";
}

/**
 * Reasons this row cannot be applied yet. An untouched row also keeps the importer's own error flags;
 * once edited those are replaced by the live check of the edited values (so fixing a value clears
 * them), and a year far from the workbook's is still caught.
 */
export function blockingProblems(row: ExcelPlanRow, draft: RowDraft | undefined, ctx: EditContext): string[] {
  if (row.op === null) return [notTickableReason(row)];
  const d = effective(row, draft);
  const out: string[] = [];
  if (!draft) out.push(...row.flags.filter((f) => f.severity === "error").map((f) => f.message));
  out.push(...liveProblems(row, d, ctx));
  if (draft && out.length === 0 && ctx.docYear !== null && row.kind !== "checklist") {
    const far = (x: string) => x !== "" && Math.abs(Number(x.slice(0, 4)) - ctx.docYear!) > 1;
    if (row.op === "create" && (far(d.start) || (row.kind === "season" && far(d.end)))) {
      out.push(`A date is more than a year away from ${ctx.docYear}. Check the year.`);
    }
  }
  if (row.op === "update" && !row.existing?.updatedAt) out.push("Cannot update safely: read the workbook again.");
  return Array.from(new Set(out));
}

export const canTick = (row: ExcelPlanRow, draft: RowDraft | undefined, ctx: EditContext): boolean =>
  blockingProblems(row, draft, ctx).length === 0;

/**
 * Flags to show beside a row. Once edited, the importer's error flags and (once a level is set) its
 * level flags are replaced by the live check, so fixable flags disappear as they are fixed.
 */
export function shownFlags(row: ExcelPlanRow, draft: RowDraft | undefined): ExcelPlanRow["flags"] {
  if (!draft) return row.flags;
  return row.flags.filter((f) => f.severity !== "error" && !(LEVEL_FLAGS.has(f.code) && draft.category.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Ticking

/** Rows a bulk action (month chip, per-kind toggle) may tick: valid, and not a duplicate or a name-only match. */
export function bulkEligible(row: ExcelPlanRow, draft: RowDraft | undefined, ctx: EditContext): boolean {
  if (row.status === "possible-duplicate") return false;
  if (row.matchKind && !isStrongMatch(row.matchKind)) return false;
  return canTick(row, draft, ctx);
}

export function defaultSelection(plan: ExcelPlan, ctx: EditContext): Set<string> {
  return new Set(allRows(plan).filter((r) => r.defaultSelected && canTick(r, undefined, ctx)).map((r) => r.rowId));
}

export function selectAllNew(plan: ExcelPlan, drafts: Drafts, ctx: EditContext): Set<string> {
  return new Set(allRows(plan).filter((r) => r.status === "new" && canTick(r, drafts[r.rowId], ctx)).map((r) => r.rowId));
}

export type TickState = "none" | "some" | "all";

/** Tri-state of a group of rows: how many bulk-eligible rows are ticked. */
export function tickState(rows: ExcelPlanRow[], selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): { state: TickState; eligible: number; ticked: number } {
  const eligible = rows.filter((r) => bulkEligible(r, drafts[r.rowId], ctx));
  const ticked = eligible.filter((r) => selected.has(r.rowId)).length;
  return { state: ticked === 0 ? "none" : ticked === eligible.length ? "all" : "some", eligible: eligible.length, ticked };
}

/** All bulk-eligible rows ticked -> untick them; otherwise tick them all. Other rows are untouched. */
export function toggleGroup(rows: ExcelPlanRow[], selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): Set<string> {
  const { state } = tickState(rows, selected, drafts, ctx);
  const next = new Set(selected);
  for (const r of rows) {
    if (!bulkEligible(r, drafts[r.rowId], ctx)) continue;
    if (state === "all") next.delete(r.rowId);
    else next.add(r.rowId);
  }
  return next;
}

/** The rows of a 'yyyy-MM' month (events, seasons, observances; checklist rows have no month). */
export const rowsOfMonth = (plan: ExcelPlan, month: string): ExcelPlanRow[] =>
  [...plan.events, ...plan.seasons, ...plan.holidays].filter((r) => r.month === month);

/** Keeps only ticks that are still valid (an edit may have made a ticked row invalid). */
export function tickedRows(plan: ExcelPlan, selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): ExcelPlanRow[] {
  return KIND_ORDER.flatMap((k) => rowsOfKind(plan, k)).filter((r) => selected.has(r.rowId) && canTick(r, drafts[r.rowId], ctx));
}

// ---------------------------------------------------------------------------
// Set level for events that lack one

/** Events whose level is still empty, in the given months (null = all months). */
export function eventsWithoutLevel(plan: ExcelPlan, drafts: Drafts, months: ReadonlySet<string> | null): ExcelPlanRow[] {
  return plan.events.filter((r) => r.op === "create" && effective(r, drafts[r.rowId]).category.trim() === "" && (!months || (r.month !== null && months.has(r.month))));
}

/**
 * Sets `level` on every new event without one in `months` (null = all months). Each is then ticked if it
 * is now valid and is a plain new event (never a possible duplicate). Rows that already have a level, and
 * events outside `months`, are not touched.
 */
export function applyLevelToUnknown(
  plan: ExcelPlan,
  drafts: Drafts,
  selected: ReadonlySet<string>,
  level: string,
  months: ReadonlySet<string> | null,
  ctx: EditContext
): { drafts: Drafts; selected: Set<string>; changed: number } {
  const nextDrafts = { ...drafts };
  const nextSelected = new Set(selected);
  const targets = eventsWithoutLevel(plan, drafts, months);
  for (const r of targets) {
    nextDrafts[r.rowId] = { ...effective(r, drafts[r.rowId]), category: level };
    if (r.status === "new" && canTick(r, nextDrafts[r.rowId], ctx)) nextSelected.add(r.rowId);
  }
  return { drafts: nextDrafts, selected: nextSelected, changed: targets.length };
}

// ---------------------------------------------------------------------------
// What Apply receives

/** The rows sent to Apply: ticked and still valid, in plan order. */
export function buildSelection(plan: ExcelPlan, selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): ExcelApplyRow[] {
  return tickedRows(plan, selected, drafts, ctx).map((r): ExcelApplyRow => {
    const d = effective(r, drafts[r.rowId]);
    const base = r.values as Record<string, unknown>;
    let values: Record<string, unknown>;
    if (r.kind === "event") {
      values = { ...base, name: d.name, event_date: d.start, event_time: d.time || null, end_time: d.endTime || null, level: d.category, notes: d.notes || null };
    } else if (r.kind === "season") {
      values = { ...base, name: d.name, category: d.category, start: d.start, end: d.end, notes: d.notes };
    } else if (r.kind === "holiday") {
      values = { ...base, name: d.name, start: d.start };
    } else {
      values = { ...base, item: d.name, status: d.status, notes: d.notes || null };
    }
    return {
      kind: r.kind,
      op: r.op as "create" | "update",
      ...(r.op === "update" && r.existingId ? { id: r.existingId } : {}),
      // The optimistic lock: Apply refuses the row if it changed after the workbook was read.
      ...(r.op === "update" && r.existing?.updatedAt ? { expectedUpdatedAt: r.existing.updatedAt } : {}),
      values,
    };
  });
}

export function selectionCounts(selection: ExcelApplyRow[]): { add: number; update: number } {
  const add = selection.filter((s) => s.op === "create").length;
  return { add, update: selection.length - add };
}

const spanText = (start: string, end: string) => (start === end || !end ? start : `${start} to ${end}`);

/** "Name (dates)" of each existing row a ticked name-only (weak) match would overwrite. */
export function weakOverwrites(plan: ExcelPlan, selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): string[] {
  return tickedRows(plan, selected, drafts, ctx)
    .filter((r) => r.op === "update" && r.existing && r.matchKind && !isStrongMatch(r.matchKind))
    .map((r) => `${r.existing!.name}${r.existing!.start ? ` (${spanText(r.existing!.start, r.existing!.end)})` : ""}`);
}

/** "Name (date)" of each ticked new row that sits next to a similar existing one. */
export function duplicateAdds(plan: ExcelPlan, selected: ReadonlySet<string>, drafts: Drafts, ctx: EditContext): string[] {
  return tickedRows(plan, selected, drafts, ctx)
    .filter((r) => r.status === "possible-duplicate" || (r.op === "create" && r.possibleDuplicates.length > 0))
    .map((r) => `${effective(r, drafts[r.rowId]).name} (${r.start})`);
}

const listed = (items: string[]) => items.slice(0, 5).join(", ") + (items.length > 5 ? ` and ${items.length - 5} more` : "");

/** Confirmation text; lists what a name-only match overwrites and what is added next to a similar row. */
export function confirmMessage(counts: { add: number; update: number }, weak: string[], dupes: string[]): string {
  let msg = `This adds ${counts.add} and updates ${counts.update}. You can Undo.`;
  if (weak.length) msg += ` ${weak.length} ${weak.length === 1 ? "row was" : "rows were"} matched by name only and will overwrite: ${listed(weak)}.`;
  if (dupes.length) msg += ` ${dupes.length} ${dupes.length === 1 ? "row looks" : "rows look"} like something already in the calendar and will still be added: ${listed(dupes)}.`;
  return msg;
}

// ---------------------------------------------------------------------------
// Counts

export interface PlanCounts {
  new: number;
  changed: number;
  unchanged: number;
  possibleDuplicates: number;
  needAttention: number;
  byKind: Record<ExcelRowKind, number>;
}

export function planCounts(plan: ExcelPlan): PlanCounts {
  const all = allRows(plan);
  return {
    new: all.filter((r) => r.status === "new").length,
    changed: all.filter((r) => r.status === "changed").length,
    unchanged: all.filter((r) => r.status === "unchanged").length,
    possibleDuplicates: all.filter((r) => r.status === "possible-duplicate").length,
    needAttention: all.filter((r) => r.invalid || r.flags.some((f) => !ROUTINE_FLAGS.has(f.code))).length,
    byKind: { event: plan.events.length, season: plan.seasons.length, holiday: plan.holidays.length, checklist: plan.checklist.length },
  };
}

/** Rows (events + seasons + observances) per month, for the month strip. */
export function monthCount(plan: ExcelPlan, month: string): number {
  return rowsOfMonth(plan, month).length;
}

/** "Section | Name | date | time | level" per ticked row (or every row when none are ticked), for pasting into a chat. */
export function copyListText(plan: ExcelPlan, selected: ReadonlySet<string>, drafts: Drafts): string {
  const rows = KIND_ORDER.flatMap((k) => rowsOfKind(plan, k));
  const use = selected.size ? rows.filter((r) => selected.has(r.rowId)) : rows;
  return use
    .map((r) => {
      const d = effective(r, drafts[r.rowId]);
      const dates = r.kind === "checklist" ? "" : d.start === d.end || r.kind === "holiday" ? d.start : `${d.start} - ${d.end}`;
      return [KIND_LABEL[r.kind], cleanText(d.name), dates, r.kind === "event" ? d.time : "", d.category].join(" | ");
    })
    .join("\n");
}
