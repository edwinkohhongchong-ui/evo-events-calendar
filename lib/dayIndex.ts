import { isSameMonth } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { DayNoteRow, EventOccurrence, HolidayRow } from "./types";

// Order within a day: all-day (no start time) first, then by start time, then
// by name so the order is stable. Needed because moved occurrences are
// appended after the day's existing ones.
export function compareByStartTime(a: EventOccurrence, b: EventOccurrence): number {
  if (!a.startTime !== !b.startTime) return a.startTime ? 1 : -1;
  if (a.startTime && b.startTime && a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.event.name.localeCompare(b.event.name);
}

export interface DayData {
  dateStr: string;
  holidays: HolidayRow[];
  occurrences: EventOccurrence[];
  dayNotes: DayNoteRow[];
}

// Builds a per-day lookup (keyed by "yyyy-MM-dd") for every day in the grid.
// Seasons are no longer bucketed per day here — they render as spanning bars
// via lib/seasonBars.ts instead, not per-day badges.
//
// monthStart scopes single-day event cards to the month actually being
// viewed — the grid's leading/trailing overflow days (from the previous/
// next month, shown muted so the week rows line up) stay visually clean
// instead of also carrying that neighboring month's events. Holidays and
// season/event bars are unaffected — they're a different concern the user
// didn't ask to change, and a multi-day bar genuinely straddling the
// boundary should still show its in-month portion.
export function buildDayIndex(
  days: Date[],
  occurrences: EventOccurrence[],
  holidays: HolidayRow[],
  monthStart: Date,
  dayNotes: DayNoteRow[] = []
): Map<string, DayData> {
  const index = new Map<string, DayData>();

  for (const day of days) {
    const dateStr = toDateStr(day);
    index.set(dateStr, { dateStr, holidays: [], occurrences: [], dayNotes: [] });
  }

  for (const holiday of holidays) {
    index.get(holiday.holiday_date)?.holidays.push(holiday);
  }

  for (const dayNote of dayNotes) {
    index.get(dayNote.note_date)?.dayNotes.push(dayNote);
  }

  for (const occurrence of occurrences) {
    // Multi-day occurrences render as spanning bars instead (see
    // lib/eventBars.ts), not per-day cards.
    if (occurrence.spanEndDate !== occurrence.occurrenceDate) continue;
    if (!isSameMonth(parseDateStr(occurrence.occurrenceDate), monthStart)) continue;
    index.get(occurrence.occurrenceDate)?.occurrences.push(occurrence);
  }

  index.forEach((day) => day.occurrences.sort(compareByStartTime));

  return index;
}
