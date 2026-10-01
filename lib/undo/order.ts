import { AffectedRow, SnapshotRow, UndoTable } from "./types";

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

export interface RestoreOp {
  table: UndoTable;
  id: string;
  row: SnapshotRow | null; // null = delete
}

// Pure planning half of restoreSnapshot: the writes/upserts (parents first)
// followed by the deletes (children first), in the order they must run.
export function planRestore(affected: AffectedRow[], which: "before" | "after"): RestoreOp[] {
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
  return [...writes, ...deletes].map((e) => ({ table: e.table, id: e.id, row: e.row }));
}
