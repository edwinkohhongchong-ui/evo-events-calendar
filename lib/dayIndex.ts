import { toDateStr } from "./dates";
import { EventOccurrence, HolidayRow } from "./types";

export interface DayData {
  dateStr: string;
  holidays: HolidayRow[];
  occurrences: EventOccurrence[];
}

// Builds a per-day lookup (keyed by "yyyy-MM-dd") for every day in the grid.
// Seasons are no longer bucketed per day here — they render as spanning bars
// via lib/seasonBars.ts instead, not per-day badges.
export function buildDayIndex(
  days: Date[],
  occurrences: EventOccurrence[],
  holidays: HolidayRow[]
): Map<string, DayData> {
  const index = new Map<string, DayData>();

  for (const day of days) {
    const dateStr = toDateStr(day);
    index.set(dateStr, { dateStr, holidays: [], occurrences: [] });
  }

  for (const holiday of holidays) {
    index.get(holiday.holiday_date)?.holidays.push(holiday);
  }

  for (const occurrence of occurrences) {
    // Multi-day occurrences render as spanning bars instead (see
    // lib/eventBars.ts), not per-day cards.
    if (occurrence.spanEndDate !== occurrence.occurrenceDate) continue;
    index.get(occurrence.occurrenceDate)?.occurrences.push(occurrence);
  }

  return index;
}
