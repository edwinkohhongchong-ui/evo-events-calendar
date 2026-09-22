// Not a fixed union — categories are managed at runtime in the `levels`
// table (see LevelRow below), editable from the /levels admin page.
export type Level = string;

export type Recurring = "None" | "Weekly" | "Monthly" | "Yearly";

// "Event": anything general (TG outing, Churchwide event, ...) — can carry a
// Pastoral Focus (see pastoral_* below). "Gathering": Sunday service, with
// its own series/preacher/sermon/theme fields. See migration 008.
export type EventType = "Event" | "Gathering";

export interface EventRow {
  id: string;
  name: string;
  event_date: string; // yyyy-MM-dd
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
  | "cyan";

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
}

export interface HolidayFormValues {
  holiday_date: string;
  name: string;
  type: HolidayType;
}

export interface SeasonFormValues {
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string | null;
  color: SeasonColorKey | null;
}

export interface ChecklistFormValues {
  category: string;
  item: string;
  status: ChecklistStatus;
  target_month: TargetMonth | null;
  notes: string | null;
}

export interface MonthFocusRow {
  id: string;
  year: number;
  month: number;
  series_focus: string | null;
  key_theme: string | null;
  notes: string | null;
}

export interface MonthFocusValues {
  series_focus: string | null;
  key_theme: string | null;
  notes: string | null;
}

// Single row, id is always "singleton" — notes shown regardless of which
// month is being viewed (left column). See migration 009.
export interface GeneralNotesRow {
  id: string;
  content: string | null;
  updated_at: string;
}

export interface OverrideRow {
  id: string;
  event_id: string;
  original_date: string; // yyyy-MM-dd — the natural, anchor-derived occurrence date
  new_date: string; // yyyy-MM-dd — the effective date, always set even on a time-only override
  new_time: string | null; // HH:mm:ss — null means no time override, use the base event's event_time
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
}
