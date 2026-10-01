// Not a fixed union — categories are managed at runtime in the `levels`
// table (see LevelRow below), editable from the /levels admin page.
export type Level = string;

export type Recurring = "None" | "Weekly" | "Monthly" | "Yearly";

// "Event": anything general (TG outing, Churchwide event, ...) — can carry a
// Pastoral Focus (see pastoral_* below). "Gathering": Sunday service, with
// its own series/preacher/sermon/theme fields. See migration 008.
export type EventType = "Event" | "Gathering";

// Only meaningful when event_type is "Gathering" — drives the auto-title
// template in the Add/Edit form (e.g. "Gathering with Edwin Koh"). See
// migration 013.
export type GatheringType = "Gathering" | "YTH Gathering" | "+EVO YTH Big Day" | "Easter/XMAS";

export interface EventRow {
  id: string;
  name: string;
  event_date: string; // yyyy-MM-dd
  end_date: string | null; // yyyy-MM-dd — null means single-day (same as event_date)
  event_time: string | null; // HH:mm:ss — start time
  end_time: string | null; // HH:mm:ss
  duration_minutes: number | null;
  level: Level;
  recurring: Recurring;
  repeat_until: string | null; // yyyy-MM-dd
  notes: string | null;
  created_at: string;
  event_type: EventType;
  // Pastoral Focus — independent booleans (not single-select), drive the
  // Y/P/U/A title prefix on Type 1 "Event" entries. Deliberately separate
  // from `level`, which stays single-select for the color legend/grouping.
  pastoral_youth: boolean;
  pastoral_poly: boolean;
  pastoral_uni: boolean;
  pastoral_adults: boolean;
  // Gathering-only fields — null when event_type is "Event".
  location: string | null; // see migration 019
  gathering_type: GatheringType | null;
  series: string | null;
  preacher_name: string | null;
  sermon_title: string | null;
  theme: string | null;
}

export type HolidayType =
  | "National (SG Public Holiday)"
  | "National (SG Public Holiday, provisional)"
  | "National (SG Observance)"
  | "School Schedule"
  | "International Observance"
  | "Church Observance"
  | "Custom";

export interface HolidayRow {
  id: string;
  holiday_date: string; // yyyy-MM-dd
  name: string;
  type: HolidayType;
}

// A short freeform tag attached to one calendar date — shown as plain green
// text in the day cell, not an event card. A day can have several; each is
// its own row, deletable independently. No author tracking (unlike
// NoteCommentRow) — meant to be quick, not a discussion log.
export interface DayNoteRow {
  id: string;
  note_date: string; // yyyy-MM-dd
  content: string;
}

export type HolidayDiffBucket = "new" | "existing" | "collision";

// One proposed holiday from a "Start a New Year" fetch, already classified
// against the existing DB rows for that year — see lib/calendarific.ts.
export interface HolidayDiffRow {
  bucket: HolidayDiffBucket;
  date: string; // yyyy-MM-dd, from Calendarific's date.iso
  name: string;
  description: string;
  rawType: string[]; // Calendarific's own classification, shown verbatim
  suggestedType: HolidayType;
  isTentative: boolean; // best-effort heuristic — see lib/calendarific.ts
  existingName: string | null; // set only for "collision" rows
}

export type SeasonCategory =
  | "Ministry Season"
  | "School Schedule"
  | "Exam Period"
  | "Growth Track"
  | "Other";

// One event category ("Churchwide", "Youth", etc.) — editable in the
// /levels admin page. `name` is the identity events.level references (see
// events_level_fkey, migration 006), not `id`.
export interface LevelRow {
  id: string;
  name: string;
  color_key: SeasonColorKey; // shares Seasons' 10-key palette — see lib/constants.ts
  sort_order: number;
}

export interface LevelFormValues {
  name: string;
  color_key: SeasonColorKey;
  sort_order: number;
}

export type SeasonColorKey =
  | "indigo"
  | "teal"
  | "rose"
  | "amber"
  | "sky"
  | "purple"
  | "emerald"
  | "orange"
  | "pink"
  | "cyan"
  | "red"
  | "yellow"
  | "blue"
  | "green";

export interface SeasonRow {
  id: string;
  name: string;
  category: SeasonCategory;
  start_date: string; // yyyy-MM-dd
  end_date: string; // yyyy-MM-dd
  notes: string | null;
  color: SeasonColorKey | null; // null = use the auto-suggested color for this name
}

export type ChecklistStatus = "Not Started" | "In Progress" | "Done";

// Optional, curated "automated check" tag — each value is backed by one
// concrete, reliable rule in lib/checklistAutoChecks.ts, picked explicitly
// from a dropdown (not inferred from the item's title). See migration 022.
export type ChecklistAutoCheckType = "school_holidays_present";

export type TargetMonth =
  | "Jan"
  | "Feb"
  | "Mar"
  | "Apr"
  | "May"
  | "Jun"
  | "Jul"
  | "Aug"
  | "Sep"
  | "Oct"
  | "Nov"
  | "Dec";

export interface ChecklistRow {
  id: string;
  category: string;
  item: string;
  status: ChecklistStatus;
  target_month: TargetMonth | null;
  notes: string | null;
  // Set via the "Link to event" picker — ON DELETE SET NULL means this goes
  // back to null automatically if the linked event is deleted. "Check
  // Calendar" reconciles status against this (see migration 014).
  linked_event_id: string | null;
  auto_check_type: ChecklistAutoCheckType | null;
}

// Slim shape for the "Link to event" picker — just enough to identify an
// event in a dropdown, not the full row.
export interface EventOption {
  id: string;
  name: string;
  event_date: string;
}

export interface HolidayFormValues {
  holiday_date: string;
  name: string;
  type: HolidayType;
}

// A saved draft template for the Reminders page — see migration 017. Sending
// is always a manual, human-reviewed step (opens Telegram's own compose
// screen); nothing here is a scheduled/automatic send.
export interface ReminderTemplateRow {
  id: string;
  name: string;
  default_message: string | null;
  default_telegram_handle: string | null;
  include_event_summary: boolean;
  lookahead_days: number;
}

export interface ReminderTemplateFormValues {
  name: string;
  default_message: string | null;
  default_telegram_handle: string | null;
  include_event_summary: boolean;
  lookahead_days: number;
}

export interface SeasonFormValues {
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string | null;
  color: SeasonColorKey | null;
}

// One institution's entered exam/term dates for one year — see migration
// 021. Manually typed in via the Seasons "Update Calendar"/"Start a New
// Year" flows (lib/examScheduleSources.ts), aggregated (earliest start/
// latest end) into a `seasons` row per group, and kept around year over
// year so next year's entry can prefill from this year's.
export interface SeasonSourceDateRow {
  id: string;
  group_name: string;
  institution: string;
  year: number;
  start_date: string | null; // yyyy-MM-dd
  end_date: string | null; // yyyy-MM-dd
}

export interface ChecklistFormValues {
  category: string;
  item: string;
  status: ChecklistStatus;
  target_month: TargetMonth | null;
  notes: string | null;
  linked_event_id: string | null;
  auto_check_type: ChecklistAutoCheckType | null;
}

// A reusable set of checklist items (see migration 018) — applying one to
// an event expands each item into a real `checklist` row linked to that
// event; repeat_count > 1 numbers the expansion ("— Week 1 of 4", etc.).
export interface ChecklistTemplateItemRow {
  id: string;
  template_id: string;
  item: string;
  repeat_count: number;
  weeks_before: number | null; // optional due offset (migration 024)
  sort_order: number;
}

export interface ChecklistTemplateRow {
  id: string;
  name: string;
}

export interface ChecklistTemplateWithItems {
  id: string;
  name: string;
  items: { id: string; item: string; repeat_count: number; weeks_before: number | null }[];
}

// A tickable to-do copied onto one event from a checklist template (migration 024).
export interface EventChecklistItemRow {
  id: string;
  event_id: string;
  item: string;
  weeks_before: number | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  source_template: string | null;
  sort_order: number;
  created_at: string;
}

// An unticked, dated checklist item together with its event: the raw input
// for the "needs attention" pill (overdue-ness is decided on the client, in
// the viewer's own timezone, with the same rule the chip badge uses).
export interface OpenChecklistRow {
  id: string;
  item: string;
  weeks_before: number;
  event: EventRow;
}

// Per-event roll-up shown as the "3/8" badge on calendar chips.
export interface EventChecklistProgress {
  done: number;
  total: number;
  // Largest weeks_before among unticked items with a due date: the earliest
  // deadline still open. null when nothing open has a due date.
  openWeeksBefore: number | null;
}

// One logged note — general (left column, shown for every month) or
// month-scoped (right column, year/month always set together). Append-only:
// there's no edit/delete, just a running log of who said what and when. See
// migration 011.
export type NoteScope = "general" | "month";

export interface NoteCommentRow {
  id: string;
  scope: NoteScope;
  year: number | null;
  month: number | null;
  author_name: string;
  content: string;
  created_at: string;
  // Set only on a reply — always points at a top-level comment (one level
  // of threading, not a reply to a reply). See migration 012.
  parent_id: string | null;
}

export interface OverrideRow {
  id: string;
  event_id: string;
  original_date: string; // yyyy-MM-dd — the natural, anchor-derived occurrence date
  new_date: string; // yyyy-MM-dd — the effective date, always set even on a time-only override
  new_time: string | null; // HH:mm:ss — null means no time override, use the base event's event_time
  new_end_date: string | null; // yyyy-MM-dd — null means no span override, use the natural span
  created_at: string;
}

// Marks one occurrence (event_id + original_date) as excluded from a
// recurring series' expansion — written when editing/deleting "only this
// event" pulls an occurrence out of the series. See migration 007.
export interface ExceptionRow {
  id: string;
  event_id: string;
  original_date: string; // yyyy-MM-dd
}

// A single occurrence of an event rendered on a specific day (recurring
// events expand into one EventOccurrence per occurrence date).
export interface EventOccurrence {
  event: EventRow;
  occurrenceDate: string; // yyyy-MM-dd — the date to render this occurrence on
  // The natural, anchor-derived date this occurrence would fall on absent any
  // override. Stable identity for a given occurrence across repeated drags —
  // always upsert/lookup overrides by this, not by occurrenceDate, so
  // dragging an already-moved occurrence again updates the same override row.
  originalDate: string;
  isOverridden: boolean;
  // Effective start/end time — the override's new_time when set, otherwise
  // the base event's event_time/end_time. All rendering code reads these,
  // never event.event_time/event.end_time directly, so a time override is
  // reflected everywhere the occurrence is shown (month view and day view).
  startTime: string | null;
  endTime: string | null;
  // Effective last day this occurrence spans, always concrete — equal to
  // occurrenceDate for a single-day occurrence. Rendering code checks
  // spanEndDate !== occurrenceDate to decide "single-day card" vs "multi-day
  // bar" (see lib/eventBars.ts, lib/dayIndex.ts).
  spanEndDate: string;
}

// Notification bell / activity feed — see lib/activity.ts and migration 023.
export type ActivityAction = "added" | "edited" | "deleted" | "moved" | "commented" | "undid" | "redid";
export type ActivityEntity =
  | "event"
  | "holiday"
  | "season"
  | "category"
  | "checklist"
  | "note"
  | "comment"
  | "day_note"
  | "undo";

export interface ActivityItem {
  id: string;
  created_at: string;
  actor_role: "editor" | "viewer";
  action: ActivityAction;
  entity: ActivityEntity;
  label: string;
  summary: string;
  href: string | null;
}
