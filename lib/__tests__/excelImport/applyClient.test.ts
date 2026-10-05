import { describe, it, expect } from "vitest";
import { applyInChunks, undoLabel, type ApplyChunk } from "../../excelImport/applyClient";
import { emptyExcelSummary, excelSavedCount } from "../../excelImport/applyValidation";
import type { ExcelApplyRow } from "../../excelImport/applyValidation";
import type { ExcelOutcome } from "../../excelImport/applyRunner";
import type { AffectedRow } from "../../undo/types";

const rows = (n: number): ExcelApplyRow[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "event" as const, op: "create" as const, values: { name: `Event ${i + 1}` } }));

const aff = (id: string): AffectedRow => ({ table: "events", id, before: null, after: { id } });

/** A fake Server Action: saves every row (one affected row each), optionally failing at a 1-based position of its chunk. */
function fake(opts: { failAt?: Record<number, number>; throwOn?: number } = {}) {
  const calls: ExcelApplyRow[][] = [];
  const apply: ApplyChunk = async (chunk) => {
    const call = calls.length;
    calls.push(chunk);
    if (opts.throwOn === call) throw new Error("Row 1 is not valid, so nothing was imported.");
    const failAt = opts.failAt?.[call];
    const summary = emptyExcelSummary();
    const saved = failAt ? failAt - 1 : chunk.length;
    summary.eventsAdded = saved;
    if (failAt) {
      summary.failed = { row: failAt, name: String((chunk[failAt - 1].values as { name: string }).name), message: "Boom." };
      summary.notAttempted = chunk.length - failAt;
    }
    const outcome: ExcelOutcome = { affected: chunk.slice(0, saved).map((r) => aff(String((r.values as { name: string }).name))), summary };
    return outcome;
  };
  return { apply, calls };
}

describe("applyInChunks", () => {
  it("sends one call for a small selection and returns its outcome", async () => {
    const f = fake();
    const out = await applyInChunks(rows(5), f.apply);
    expect(f.calls.map((c) => c.length)).toEqual([5]);
    expect(out.summary.eventsAdded).toBe(5);
    expect(out.summary.failed).toBeNull();
    expect(out.affected).toHaveLength(5);
  });

  it("splits at the chunk size, keeps order, and combines every chunk into one result", async () => {
    const f = fake();
    const progress: number[] = [];
    const out = await applyInChunks(rows(7), f.apply, { size: 3, onProgress: (done) => progress.push(done) });
    expect(f.calls.map((c) => c.length)).toEqual([3, 3, 1]);
    expect(out.summary.eventsAdded).toBe(7);
    expect(excelSavedCount(out.summary)).toBe(7);
    // `affected` is concatenated in call order, so ONE Undo reverts all of it.
    expect(out.affected.map((a) => a.id)).toEqual(rows(7).map((r) => (r.values as { name: string }).name));
    expect(progress).toEqual([3, 6, 7]);
  });

  it("never sends more than the server cap, even if asked", async () => {
    const f = fake();
    await applyInChunks(rows(650), f.apply, { size: 5000 });
    expect(f.calls.map((c) => c.length)).toEqual([300, 300, 50]);
  });

  it("stops at the first failure, offsets the failed row by earlier chunks and counts later rows as not tried", async () => {
    const f = fake({ failAt: { 1: 2 } });
    const out = await applyInChunks(rows(10), f.apply, { size: 4 });
    expect(f.calls).toHaveLength(2); // the third chunk was never sent
    expect(out.summary.failed).toEqual({ row: 4 + 2, name: "Event 6", message: "Boom." });
    expect(out.summary.eventsAdded).toBe(4 + 1);
    // 2 not attempted in the failing chunk after the failed row + 2 in the untouched last chunk.
    expect(out.summary.notAttempted).toBe(2 + 2);
    expect(out.affected).toHaveLength(5);
  });

  it("a failure on the very first row of a later chunk still reports the right row and keeps earlier saves", async () => {
    const f = fake({ failAt: { 1: 1 } });
    const out = await applyInChunks(rows(6), f.apply, { size: 3 });
    expect(out.summary.failed?.row).toBe(4);
    expect(out.summary.eventsAdded).toBe(3);
    expect(out.summary.notAttempted).toBe(2);
  });

  it("a failure inside the first chunk keeps its own row number", async () => {
    const f = fake({ failAt: { 0: 3 } });
    const out = await applyInChunks(rows(8), f.apply, { size: 5 });
    expect(out.summary.failed?.row).toBe(3);
    expect(out.summary.notAttempted).toBe(2 + 3);
    expect(f.calls).toHaveLength(1);
  });

  it("rethrows when the first chunk is rejected before anything was saved", async () => {
    const f = fake({ throwOn: 0 });
    await expect(applyInChunks(rows(5), f.apply, { size: 2 })).rejects.toThrow(/nothing was imported/);
    expect(f.calls).toHaveLength(1);
  });

  it("returns the earlier chunks as saved when a LATER chunk is rejected whole", async () => {
    const f = fake({ throwOn: 1 });
    const out = await applyInChunks(rows(6), f.apply, { size: 2 });
    expect(out.summary.eventsAdded).toBe(2);
    expect(out.summary.failed).toMatchObject({ row: 3, name: "Event 3" });
    expect(out.summary.notAttempted).toBe(3);
    expect(out.affected).toHaveLength(2);
    expect(f.calls).toHaveLength(2);
  });

  it("handles an empty selection without calling the server", async () => {
    const f = fake();
    const out = await applyInChunks([], f.apply);
    expect(f.calls).toHaveLength(0);
    expect(excelSavedCount(out.summary)).toBe(0);
  });
});

describe("undoLabel", () => {
  it("names the whole import once", () => {
    expect(undoLabel(1)).toBe("Import Excel calendar (1 row)");
    expect(undoLabel(650)).toBe("Import Excel calendar (650 rows)");
  });
});
