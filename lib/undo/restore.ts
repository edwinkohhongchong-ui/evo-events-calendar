"use server";

import { supabase } from "../supabase";
import { AffectedRow, SnapshotRow, UndoTable } from "./types";
import { planRestore } from "./order";
import { requireRole } from "../authz";
import { runAction } from "../actionResult";
import { logActivity } from "../activity";

async function applyRow(table: UndoTable, id: string, row: SnapshotRow | null): Promise<void> {
  if (row === null) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      console.error(error);
      throw new Error("Something went wrong undoing/redoing that change. Please try again.");
    }
    return;
  }
  const { error } = await supabase.from(table).upsert(row);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong undoing/redoing that change. Please try again.");
  }
}

// Restores `affected` to either its `before` or `after` image, in the order
// planRestore decides (see lib/undo/order.ts).
async function restoreSnapshotImpl(affected: AffectedRow[], which: "before" | "after"): Promise<void> {
  await requireRole("editor");
  for (const op of planRestore(affected, which)) {
    await applyRow(op.table, op.id, op.row);
  }
  // "before" image restored = undo; "after" image restored = redo.
  await logActivity({ action: which === "before" ? "undid" : "redid", entity: "undo", label: "a change" });
}

// Public Server Action: returns an ActionResult (see lib/actionResult.ts).
export async function restoreSnapshot(...args: Parameters<typeof restoreSnapshotImpl>) {
  return runAction(() => restoreSnapshotImpl(...args));
}
