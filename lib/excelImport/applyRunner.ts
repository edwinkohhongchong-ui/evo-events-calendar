import { safeActionMessage } from "../actionResult";
import { RowConflictError } from "../rowConflict";
import { seasonWriteValues } from "../schedules/applyRunner";
import type { EventFormValues } from "../actions";
import type { ChecklistFormValues, HolidayFormValues, SeasonFormValues } from "../types";
import type { AffectedRow } from "../undo/types";
import { emptyExcelSummary } from "./applyValidation";
import type { ChecklistPatch, CleanExcelRow, EventPatch, ExcelApplySummary } from "./applyValidation";

// The sequential core of "Apply Excel import". Database access is injected so
// stop-on-first-failure and the Undo bookkeeping can be unit-tested; the real
// writers (lib/rowWrites.ts) are wired in by lib/excelImportActions.ts.

export interface ExcelWriters {
  insertEvent(values: EventFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateEvent(id: string, patch: EventPatch, expectedUpdatedAt: string): Promise<AffectedRow[]>;
  insertSeason(values: SeasonFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateSeason(id: string, values: SeasonFormValues, expectedUpdatedAt?: string): Promise<AffectedRow[]>;
  insertHoliday(values: HolidayFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateHoliday(id: string, values: HolidayFormValues, expectedUpdatedAt?: string): Promise<AffectedRow[]>;
  insertChecklist(values: ChecklistFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateChecklist(id: string, patch: ChecklistPatch, expectedUpdatedAt: string): Promise<AffectedRow[]>;
}

export interface ExcelOutcome {
  /**
   * Everything saved by this call, including rows saved before a failure. A client that applies a
   * big selection in several calls concatenates these arrays (in call order) into ONE
   * UndoableAction, so one Undo reverts the whole import.
   */
  affected: AffectedRow[];
  summary: ExcelApplySummary;
}

export const EXCEL_CONFLICT_MESSAGE = "Changed by someone else since you read the workbook. Read the workbook again.";

const rowName = (row: CleanExcelRow): string => {
  const v = row.values as { name?: unknown; item?: unknown };
  return String(row.kind === "checklist" ? (v.item ?? "") : (v.name ?? "")) || row.kind;
};

export async function runExcelImport(rows: CleanExcelRow[], w: ExcelWriters): Promise<ExcelOutcome> {
  const affected: AffectedRow[] = [];
  const summary = emptyExcelSummary();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.kind === "event") {
        if (row.op === "create") {
          affected.push(...(await w.insertEvent(row.values)).affected);
          summary.eventsAdded++;
        } else {
          affected.push(...(await w.updateEvent(row.id, row.values, row.expectedUpdatedAt)));
          summary.eventsUpdated++;
        }
      } else if (row.kind === "checklist") {
        if (row.op === "create") {
          affected.push(...(await w.insertChecklist(row.values)).affected);
          summary.checklistAdded++;
        } else {
          affected.push(...(await w.updateChecklist(row.id, row.values, row.expectedUpdatedAt)));
          summary.checklistUpdated++;
        }
      } else if (row.kind === "holiday") {
        if (row.op === "create") {
          affected.push(...(await w.insertHoliday(row.values)).affected);
          summary.holidaysAdded++;
        } else {
          affected.push(...(await w.updateHoliday(row.id as string, row.values, row.expectedUpdatedAt)));
          summary.holidaysUpdated++;
        }
      } else {
        const values = seasonWriteValues(row);
        if (row.op === "create") {
          affected.push(...(await w.insertSeason(values)).affected);
          summary.seasonsAdded++;
        } else {
          affected.push(...(await w.updateSeason(row.id as string, values, row.expectedUpdatedAt)));
          summary.seasonsUpdated++;
        }
      }
    } catch (err) {
      console.error(err);
      // Only text we wrote ourselves reaches the browser: safeActionMessage swaps anything database-shaped for a generic line.
      summary.failed = { row: i + 1, name: rowName(row), message: err instanceof RowConflictError ? EXCEL_CONFLICT_MESSAGE : safeActionMessage(err) };
      summary.notAttempted = rows.length - i - 1;
      break;
    }
  }
  return { affected, summary };
}

/** Earliest date among the rows that have one, for the activity entry's link. */
export function earliestExcelDate(rows: CleanExcelRow[]): string | null {
  const dates: string[] = [];
  for (const r of rows) {
    if (r.kind === "event" && r.op === "create") dates.push(r.values.event_date);
    else if (r.kind === "holiday") dates.push(r.values.holiday_date);
    else if (r.kind === "season") dates.push(r.values.start_date);
  }
  dates.sort();
  return dates[0] ?? null;
}
