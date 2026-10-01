"use server";

import { supabase } from "../supabase";
import { AffectedRow, SnapshotRow, UndoTable } from "./types";
import { requireRole } from "../authz";
import { runAction } from "../actionResult";
import { logActivity } from "../activity";

// Parent rows must exist before their children are written (events before
// event_overrides/event_exceptions/event_checklist_items; a top-level note_comments row before its
// replies), and children should be removed before their parents when a
// parent is also being deleted — though ON DELETE CASCADE would clean them
// up anyway, doing it explicitly keeps behavior predictable if a child's
// snapshot differs from what cascade alone would produce.
function rank(table: UndoTable, row: SnapshotRow): number {
  if (table === "event_overrides" || table === "event_exceptions" || table === "event_checklist_items") return 1;
  if (table === "note_comments") return row.parent_id ? 1 : 0;
  if (table === "checklist_template_items") return 1;
  return 0;
}

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

// Restores `affected` to either its `before` or `after` image. Writes/
// upserts (row present) run parent-tables-first; deletes (row null) run
// child-tables-first — each in the order the entries were recorded within
// their own rank, since a bulk-migrated set of override rows (see
// splitSeriesFromOccurrence) has no ordering dependency on each other.
async function restoreSnapshotImpl(affected: AffectedRow[], which: "before" | "after"): Promise<void> {
  await requireRole("editor");
  const entries = affected.map((a) => ({ ...a, row: which === "before" ? a.before : a.after }));
  const writes = entries.filter((e) => e.row !== null).sort((a, b) => rank(a.table, a.row!) - rank(b.table, b.row!));
  const deletes = entries.filter((e) => e.row === null);
  // A delete's own row is null, so rank it using whichever image *does*
  // exist (the other side of the same entry) to preserve parent/child order.
  deletes.sort((a, b) => {
    const aRef = a.before ?? a.after ?? {};
    const bRef = b.before ?? b.after ?? {};
    return rank(b.table, bRef) - rank(a.table, aRef);
  });

  for (const e of writes) {
    await applyRow(e.table, e.id, e.row);
  }
  for (const e of deletes) {
    await applyRow(e.table, e.id, null);
  }
  // "before" image restored = undo; "after" image restored = redo.
  await logActivity({ action: which === "before" ? "undid" : "redid", entity: "undo", label: "a change" });
}

// Public Server Action: returns an ActionResult (see lib/actionResult.ts).
export async function restoreSnapshot(...args: Parameters<typeof restoreSnapshotImpl>) {
  return runAction(() => restoreSnapshotImpl(...args));
}
