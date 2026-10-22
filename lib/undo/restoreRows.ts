// Validation for rows an Undo/Redo is about to write. restoreSnapshot is a
// Server Action, so its `affected` argument is attacker-controllable JSON: a
// crafted call could otherwise upsert any column of any undoable table. Pure
// (no Supabase) so it can be unit-tested.
import {
  CHECKLIST_COLUMNS,
  DAY_NOTE_COLUMNS,
  EVENT_CHECKLIST_ITEM_COLUMNS,
  EVENT_COLUMNS,
  HOLIDAY_COLUMNS,
  LEVEL_COLUMNS,
  REMINDER_TEMPLATE_COLUMNS,
  SEASON_COLUMNS,
} from "../pickColumns";
import { normaliseColor } from "../colorStyle";
import { parseOwner } from "../owner";
import type { RestoreOp } from "./order";
import type { UndoTable } from "./types";

const keys = (o: object) => Object.keys(o);
// Set by the database itself; a snapshot (a `select *`) always carries them.
const SYSTEM = ["id", "created_at", "updated_at"];

const ALLOWED: Record<UndoTable, ReadonlySet<string>> = {
  events: new Set([...SYSTEM, ...keys(EVENT_COLUMNS)]),
  levels: new Set([...SYSTEM, ...keys(LEVEL_COLUMNS)]),
  holidays: new Set([...SYSTEM, ...keys(HOLIDAY_COLUMNS)]),
  seasons: new Set([...SYSTEM, ...keys(SEASON_COLUMNS)]),
  checklist: new Set([...SYSTEM, ...keys(CHECKLIST_COLUMNS)]),
  reminder_templates: new Set([...SYSTEM, ...keys(REMINDER_TEMPLATE_COLUMNS)]),
  day_notes: new Set([...SYSTEM, ...keys(DAY_NOTE_COLUMNS)]),
  event_checklist_items: new Set([...SYSTEM, ...keys(EVENT_CHECKLIST_ITEM_COLUMNS)]),
  event_overrides: new Set([...SYSTEM, "event_id", "original_date", "new_date", "new_time", "new_end_date"]),
  event_exceptions: new Set([...SYSTEM, "event_id", "original_date"]),
  note_comments: new Set([...SYSTEM, "scope", "year", "month", "author_name", "content", "parent_id"]),
  checklist_templates: new Set([...SYSTEM, "name"]),
  checklist_template_items: new Set([...SYSTEM, "template_id", "item", "repeat_count", "weeks_before", "sort_order"]),
};

const BAD = "That change can't be undone or redone because its saved details look wrong.";

/**
 * Throws a plain, user-safe error if any write in `ops` carries an unknown
 * table or column, a mismatched id, a bad colour or a bad owner. A delete
 * (row === null) is checked for table and id only. Checks everything before the caller
 * writes anything, so a bad row means nothing is written.
 */
export function assertRestorable(ops: RestoreOp[]): void {
  for (const op of ops) {
    const allowed = Object.prototype.hasOwnProperty.call(ALLOWED, op.table) ? ALLOWED[op.table] : undefined;
    if (!allowed || typeof op.id !== "string") throw new Error(BAD); // deletes are checked too
    if (op.row === null) continue;
    if (typeof op.row !== "object" || Array.isArray(op.row)) throw new Error(BAD);
    for (const key of Object.keys(op.row)) {
      if (!allowed.has(key)) throw new Error(BAD);
    }
    if (op.row.id !== op.id) throw new Error(BAD);
    const color = op.table === "levels" ? op.row.color_key : op.table === "seasons" ? op.row.color : null;
    if ((op.table === "levels" || (op.table === "seasons" && color != null)) && normaliseColor(color) === null) {
      throw new Error(BAD);
    }
    if (op.table === "events" || op.table === "event_checklist_items") {
      try {
        parseOwner(op.row.owner);
      } catch {
        throw new Error(BAD);
      }
    }
  }
}
