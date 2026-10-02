import { safeActionMessage } from "../actionResult";
import { RowConflictError } from "../rowConflict";
import { pickSeasonColumns } from "../pickColumns";
import { suggestSeasonColor } from "../seasonColor";
import type { HolidayFormValues, SeasonFormValues } from "../types";
import type { AffectedRow } from "../undo/types";
import type { ApplySummary, CleanImportRow } from "./applyValidation";

// The sequential core of "Apply import". Database access is injected so the
// stop-on-first-failure and Undo bookkeeping can be unit-tested; the real
// writers (lib/rowWrites.ts) are wired in by lib/scheduleImportActions.ts.

export interface ImportWriters {
  insertSeason(values: SeasonFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateSeason(id: string, values: SeasonFormValues, expectedUpdatedAt?: string): Promise<AffectedRow[]>;
  insertHoliday(values: HolidayFormValues): Promise<{ id: string; affected: AffectedRow[] }>;
  updateHoliday(id: string, values: HolidayFormValues, expectedUpdatedAt?: string): Promise<AffectedRow[]>;
}

export interface ImportOutcome {
  /** Everything saved so far, including rows saved before a failure, so one Undo reverts them all. */
  affected: AffectedRow[];
  summary: ApplySummary;
}

/** Creates get an auto-suggested colour unless one was sent; updates keep the existing colour. */
export function seasonWriteValues(row: Extract<CleanImportRow, { kind: "season" }>): SeasonFormValues {
  const v = row.values;
  const color = row.op === "create" ? (v.color ?? suggestSeasonColor(v.name)) : v.color;
  return pickSeasonColumns({
    name: v.name,
    category: v.category,
    start_date: v.start_date,
    end_date: v.end_date,
    notes: v.notes,
    color,
  } as SeasonFormValues);
}

export const IMPORT_CONFLICT_MESSAGE = "Changed by someone else since you read the document. Read the document again.";

export async function runImport(rows: CleanImportRow[], w: ImportWriters): Promise<ImportOutcome> {
  const affected: AffectedRow[] = [];
  const summary: ApplySummary = {
    holidaysAdded: 0,
    holidaysUpdated: 0,
    seasonsAdded: 0,
    seasonsUpdated: 0,
    failed: null,
    notAttempted: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.kind === "holiday") {
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
      summary.failed = { row: i + 1, name: row.values.name, message: err instanceof RowConflictError ? IMPORT_CONFLICT_MESSAGE : safeActionMessage(err) };
      summary.notAttempted = rows.length - i - 1;
      break;
    }
  }
  return { affected, summary };
}

/** Earliest date among the rows, for the activity entry's link. */
export function earliestDate(rows: CleanImportRow[]): string | null {
  const dates = rows.map((r) => (r.kind === "holiday" ? r.values.holiday_date : r.values.start_date)).sort();
  return dates[0] ?? null;
}
