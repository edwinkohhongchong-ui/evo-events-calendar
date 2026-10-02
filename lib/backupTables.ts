// Every table the app reads or writes via `.from("...")`. The backup route
// dumps exactly these; lib/__tests__/backupTables.test.ts scans the source and
// fails if a table used in lib/ or app/ is missing here.
export const BACKUP_TABLES = [
  "events",
  "holidays",
  "seasons",
  "season_source_dates",
  "levels",
  "checklist",
  "checklist_templates",
  "checklist_template_items",
  "event_checklist_items",
  "day_notes",
  "note_comments",
  "reminder_templates",
  "event_overrides",
  "event_exceptions",
  "month_focus",
  "general_notes",
  "activity_log",
] as const;

// Deterministic sort keys for paging. `.range()` without an ORDER BY can skip or
// repeat rows between pages once a table passes PostgREST's 1000-row cap. Every
// table has a unique `id` primary key today (month_focus also has a unique
// (year, month), but id is enough); a table without one must be listed here.
const ORDER_OVERRIDES: Partial<Record<BackupTable, readonly string[]>> = {};

export type BackupTable = (typeof BACKUP_TABLES)[number];

export function backupOrderColumns(table: BackupTable): readonly string[] {
  return ORDER_OVERRIDES[table] ?? ["id"];
}
