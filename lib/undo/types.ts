// Generic snapshot-based undo. Every mutating action in lib/*Actions.ts
// returns the full set of rows it touched, each carrying a `before` and
// `after` image (either can be null — null `before` means the row was
// created, null `after` means it was deleted). Undo/redo just replays those
// snapshots through the same tables rather than trying to hand-write an
// inverse for every action, which would mean re-deriving the same
// conditional upsert/delete branching (see lib/actions.ts's recurrence
// functions) in reverse.
export type UndoTable =
  | "events"
  | "event_overrides"
  | "event_exceptions"
  | "event_checklist_items"
  | "levels"
  | "holidays"
  | "seasons"
  | "checklist"
  | "day_notes"
  | "note_comments"
  | "reminder_templates"
  | "checklist_templates"
  | "checklist_template_items";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SnapshotRow = Record<string, any>;

export interface AffectedRow {
  table: UndoTable;
  id: string;
  before: SnapshotRow | null;
  after: SnapshotRow | null;
}

// One user-facing action (a save, a delete, a drag) — may touch several
// rows across several tables (e.g. splitting a recurring series), all
// undone/redone together as a single step.
export interface UndoableAction {
  label: string;
  affected: AffectedRow[];
}
