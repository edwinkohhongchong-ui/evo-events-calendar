import { MAX_NOTES_LENGTH, rowProblems } from "./applyValidation";
import type { ImportRowInput } from "./applyValidation";
import type { PlanRow, SchedulePlan } from "./planRows";
import { cleanNotes, cleanText } from "./text";
import { isStrongMatch } from "./diff";
import { copyText } from "./holidayCheck";

// Pure helpers behind the import preview: what is ticked, what can be ticked,
// what gets sent to Apply, and the counts shown. No React, no I/O.

/** What the inline editor can change. */
export interface RowDraft {
  name: string;
  category: string;
  start: string;
  end: string;
  notes: string;
}

export type Drafts = Record<string, RowDraft>;

export function draftFromRow(row: PlanRow): RowDraft {
  return { name: row.name, category: row.category, start: row.start, end: row.end, notes: row.notes };
}

export function effective(row: PlanRow, draft?: RowDraft): RowDraft {
  return draft ?? draftFromRow(row);
}

/**
 * Plain-language reasons this row cannot be applied yet. An untouched row with an
 * error flag stays blocked. Once edited, the flag is replaced by a live check of the
 * edited values (so fixing the date clears it), and a year far from the document's is
 * still caught.
 */
export function blockingProblems(row: PlanRow, draft: RowDraft | undefined, docYear: number | null): string[] {
  const out: string[] = [];
  if (!draft) out.push(...row.flags.filter((f) => f.severity === "error").map((f) => f.message));
  else {
    // Notes are checked separately below so the message is the same for untouched and edited rows.
    out.push(...rowProblems(row.kind, { name: draft.name, category: draft.category, start: draft.start, end: row.kind === "holiday" ? draft.start : draft.end, notes: "" }));
    if (out.length === 0 && docYear !== null) {
      const far = (d: string) => Math.abs(Number(d.slice(0, 4)) - docYear) > 1;
      if (far(draft.start) || (row.kind === "season" && far(draft.end))) {
        out.push(`A date is more than a year away from ${docYear}. Check the year.`);
      }
    }
  }
  // Apply rejects the whole selection if one row is bad, so these are caught per row here. The notes
  // value is already the merged text (existing notes plus the document's) for an update row.
  const notes = draft ? draft.notes : row.notes;
  if (row.kind === "season" && cleanNotes(notes).length > MAX_NOTES_LENGTH) {
    out.push(`Notes would be longer than ${MAX_NOTES_LENGTH} characters; edit the notes`);
  }
  if (row.existingId && !row.existing?.updatedAt) out.push("Cannot update safely: read the document again");
  return out;
}

export function canTick(row: PlanRow, draft: RowDraft | undefined, docYear: number | null): boolean {
  return blockingProblems(row, draft, docYear).length === 0;
}

export function defaultSelection(plan: SchedulePlan): Set<string> {
  return new Set([...plan.holidays, ...plan.seasons].filter((r) => r.defaultSelected).map((r) => r.rowId));
}

export function selectAllNew(plan: SchedulePlan, drafts: Drafts): Set<string> {
  return new Set(
    [...plan.holidays, ...plan.seasons]
      .filter((r) => r.status === "new" && canTick(r, drafts[r.rowId], plan.docYear))
      .map((r) => r.rowId)
  );
}

/** The rows sent to Apply: ticked, still valid, create vs update decided by the match. */
export function buildSelection(plan: SchedulePlan, selected: Set<string>, drafts: Drafts): ImportRowInput[] {
  return [...plan.holidays, ...plan.seasons]
    .filter((r) => selected.has(r.rowId) && canTick(r, drafts[r.rowId], plan.docYear))
    .map((r) => {
      const v = effective(r, drafts[r.rowId]);
      return {
        kind: r.kind,
        op: r.existingId ? ("update" as const) : ("create" as const),
        ...(r.existingId ? { id: r.existingId } : {}),
        // The optimistic lock: Apply refuses the row if it changed after the document was read.
        ...(r.existingId && r.existing?.updatedAt ? { expectedUpdatedAt: r.existing.updatedAt } : {}),
        values: { name: v.name, category: v.category, start: v.start, end: r.kind === "holiday" ? v.start : v.end, notes: v.notes },
      };
    });
}

/** "Name (dates)" of each existing row a ticked weak (name-only) match would overwrite. */
export function weakOverwrites(plan: SchedulePlan, selected: Set<string>, drafts: Drafts): string[] {
  return [...plan.holidays, ...plan.seasons]
    .filter((r) => selected.has(r.rowId) && canTick(r, drafts[r.rowId], plan.docYear) && r.existing && r.matchKind && !isStrongMatch(r.matchKind))
    .map((r) => `${r.existing!.name} (${r.existing!.start === r.existing!.end ? r.existing!.start : `${r.existing!.start} to ${r.existing!.end}`})`);
}

/** Confirmation text; lists weak-match overwrites (first 5) so the user sees what will be replaced. */
export function confirmMessage(counts: { add: number; update: number }, weak: string[]): string {
  const base = `This adds ${counts.add} and updates ${counts.update}. You can Undo.`;
  if (weak.length === 0) return base;
  const shown = weak.slice(0, 5).join(", ");
  const more = weak.length > 5 ? ` and ${weak.length - 5} more` : "";
  return `${base} ${weak.length} ${weak.length === 1 ? "row was" : "rows were"} matched by name only and will overwrite: ${shown}${more}.`;
}

export function selectionCounts(selection: ImportRowInput[]): { add: number; update: number } {
  const add = selection.filter((s) => s.op === "create").length;
  return { add, update: selection.length - add };
}

export interface PlanCounts {
  new: number;
  changed: number;
  unchanged: number;
  needAttention: number;
  ignored: number;
}

export function planCounts(plan: SchedulePlan): PlanCounts {
  const all = [...plan.holidays, ...plan.seasons];
  return {
    new: all.filter((r) => r.status === "new").length,
    changed: all.filter((r) => r.status === "changed").length,
    unchanged: all.filter((r) => r.status === "unchanged").length,
    // Tentative alone is routine in this document; anything else is worth a look.
    needAttention: all.filter((r) => r.flags.some((f) => f.code !== "tentative")).length,
    ignored: plan.ignoredLines.length,
  };
}

/**
 * "Section | Name | start - end | tentative? [| Calendarific result]" one line per ticked row, for pasting
 * into a chat to double-check. Holidays get the Calendarific column when the check ran.
 */
export function copyListText(plan: SchedulePlan, selected: Set<string>, drafts: Drafts): string {
  const lines: string[] = [];
  const check = plan.holidayCheck?.status === "ok" ? new Map(plan.holidayCheck.rows.map((c) => [c.rowId, c])) : null;
  const add = (section: string, rows: PlanRow[]) => {
    for (const r of rows) {
      if (!selected.has(r.rowId)) continue;
      const v = effective(r, drafts[r.rowId]);
      const dates = r.kind === "holiday" || v.start === v.end ? v.start : `${v.start} - ${v.end}`;
      const cols = [section, cleanText(v.name), dates, r.tentative ? "tentative" : ""];
      if (check && r.kind === "holiday") {
        // The check ran on the document's values; an edited row has not been re-checked.
        cols.push(drafts[r.rowId] && (v.name !== r.name || v.start !== r.start) ? "Calendarific: not rechecked (edited)" : copyText(check.get(r.rowId)));
      }
      lines.push(cols.join(" | "));
    }
  };
  add("Holidays", plan.holidays);
  add("Seasons", plan.seasons);
  return lines.join("\n");
}
