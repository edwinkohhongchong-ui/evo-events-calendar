import { toDateStr } from "./dates";
import { EventOccurrence, HolidayRow, SeasonRow } from "./types";

export interface DayData {
  dateStr: string;
  holidays: HolidayRow[];
  seasons: SeasonRow[];
  occurrences: EventOccurrence[];
}

// Builds a per-day lookup (keyed by "yyyy-MM-dd") for every day in the grid.
// "yyyy-MM-dd" strings sort/compare lexicographically the same as chronological
// order, so plain string comparisons below are safe and avoid any Date/timezone
// handling for the season overlap check.
export function buildDayIndex(
  days: Date[],
  occurrences: EventOccurrence[],
  holidays: HolidayRow[],
  seasons: SeasonRow[]
): Map<string, DayData> {
  const index = new Map<string, DayData>();

  for (const day of days) {
    const dateStr = toDateStr(day);
    index.set(dateStr, { dateStr, holidays: [], seasons: [], occurrences: [] });
  }

  for (const holiday of holidays) {
    index.get(holiday.holiday_date)?.holidays.push(holiday);
  }

  for (const occurrence of occurrences) {
    index.get(occurrence.occurrenceDate)?.occurrences.push(occurrence);
  }

  index.forEach((day, dateStr) => {
    for (const season of seasons) {
      if (season.start_date <= dateStr && dateStr <= season.end_date) {
        day.seasons.push(season);
      }
    }
  });

  return index;
}
