export type Level =
  | "Churchwide"
  | "Youth"
  | "Tertiary"
  | "Adults"
  | "COW"
  | "Thirdspace"
  | "Gathering";

export type Recurring = "None" | "Weekly" | "Monthly" | "Yearly";

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

export interface OverrideRow {
  id: string;
  event_id: string;
  original_date: string; // yyyy-MM-dd — the natural, anchor-derived occurrence date
  new_date: string; // yyyy-MM-dd — the effective date, always set even on a time-only override
  new_time: string | null; // HH:mm:ss — null means no time override, use the base event's event_time
  created_at: string;
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
