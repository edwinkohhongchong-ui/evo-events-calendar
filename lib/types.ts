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
  event_time: string | null; // HH:mm:ss
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

// A single occurrence of an event rendered on a specific day (recurring
// events expand into one EventOccurrence per occurrence date).
export interface EventOccurrence {
  event: EventRow;
  occurrenceDate: string; // yyyy-MM-dd
}
