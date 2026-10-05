import type { AffectedRow } from "../undo/types";
import { combineExcelSummaries, emptyExcelSummary } from "./applyValidation";
import type { ExcelApplyRow, ExcelApplySummary } from "./applyValidation";
import type { ExcelOutcome } from "./applyRunner";
import { MAX_EXCEL_APPLY_ROWS } from "./limits";

// Client-side driver for a big Apply. The Server Action takes at most
// MAX_EXCEL_APPLY_ROWS rows per call, so a bigger selection goes up in
// sequential chunks. Every chunk's `affected` rows are joined, in order, so the
// caller can record ONE Undo for the whole import. The first failed chunk stops
// the run. Pure: the Server Action is injected (it must return the outcome and
// THROW when a chunk was rejected before anything in it was written).

export type ApplyChunk = (rows: ExcelApplyRow[]) => Promise<ExcelOutcome>;

export interface ChunkedOutcome {
  /** Everything saved by every chunk that ran, in order. */
  affected: AffectedRow[];
  /** Counts for the whole run; `failed.row` is 1-based over ALL rows, `notAttempted` counts every row after the failure. */
  summary: ExcelApplySummary;
}

const rowLabel = (r: ExcelApplyRow): string => {
  const v = r.values as { name?: unknown; item?: unknown };
  return String((r.kind === "checklist" ? v.item : v.name) ?? "") || r.kind;
};

/**
 * Applies `rows` in chunks of at most `size`. `onProgress` gets the number of rows finished so far.
 * Throws only when the very first chunk was rejected (nothing was saved); a failure after that is
 * returned as `summary.failed` together with what was saved.
 */
export async function applyInChunks(
  rows: ExcelApplyRow[],
  apply: ApplyChunk,
  options: { size?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<ChunkedOutcome> {
  const size = Math.max(1, Math.min(options.size ?? MAX_EXCEL_APPLY_ROWS, MAX_EXCEL_APPLY_ROWS));
  const affected: AffectedRow[] = [];
  const parts: ExcelApplySummary[] = [];

  for (let offset = 0; offset < rows.length; offset += size) {
    const chunk = rows.slice(offset, offset + size);
    const later = rows.length - offset - chunk.length;
    let outcome: ExcelOutcome;
    try {
      outcome = await apply(chunk);
    } catch (err) {
      if (offset === 0) throw err;
      // This chunk was rejected whole (nothing in it saved); earlier chunks stay saved and undoable.
      const stopped = emptyExcelSummary();
      stopped.failed = {
        row: offset + 1,
        name: rowLabel(chunk[0]),
        message: err instanceof Error ? err.message : "Something went wrong.",
      };
      stopped.notAttempted = rows.length - offset - 1;
      parts.push(stopped);
      break;
    }
    affected.push(...outcome.affected);
    const part = { ...outcome.summary };
    if (part.failed) {
      part.failed = { ...part.failed, row: part.failed.row + offset };
      part.notAttempted += later;
      parts.push(part);
      break;
    }
    parts.push(part);
    options.onProgress?.(offset + chunk.length, rows.length);
  }
  return { affected, summary: combineExcelSummaries(parts) };
}

/** Label for the single Undo entry of a whole import. */
export const undoLabel = (saved: number): string => `Import Excel calendar (${saved} ${saved === 1 ? "row" : "rows"})`;
