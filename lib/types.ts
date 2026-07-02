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

export type SeasonCategory =
  | "Ministry Season"
  | "School Schedule"
  | "Exam Period"
  | "Growth Track"
  | "Other";

export interface SeasonRow {
  id: string;
  name: string;
  category: SeasonCategory;
  start_date: string; // yyyy-MM-dd
  end_date: string; // yyyy-MM-dd
  notes: string | null;
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
  new_date: string; // yyyy-MM-dd — where that occurrence was dragged to
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
}
