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
