import { parseISO, format } from "date-fns";

// All dates in this app are plain calendar dates (no time-of-day, no timezone).
// Supabase `date` columns come back as bare "yyyy-MM-dd" strings. We parse them
// with `parseISO`, which treats a date-only string as local midnight (it does
// NOT shift to UTC), and we format back to "yyyy-MM-dd" the same way. Never use
// `.toISOString()` anywhere in this pipeline — that converts to UTC and can
// push a date a day off depending on the machine's timezone.

export function parseDateStr(dateStr: string): Date {
  return parseISO(dateStr);
}

export function toDateStr(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Formats a "yyyy-MM-dd" string as e.g. "4 Jan 2026" for table display.
export function formatDateDisplay(dateStr: string): string {
  return format(parseDateStr(dateStr), "d MMM yyyy");
}

// Formats a bare "HH:mm:ss" (or "HH:mm") time string as e.g. "3:00 PM".
// Deliberately does not touch Date objects — this is a string, not a moment
// in time, so there's nothing to localize/convert.
export function formatEventTime(time: string | null): string | null {
  if (!time) return null;
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

// Formats a start/end time pair as e.g. "3:00–4:30 PM" when both fall in the
// same AM/PM period, or "11:00 PM–2:00 AM" when they don't. Falls back to
// just the start time if there's no end time (e.g. pre-Phase-5 events).
export function formatEventTimeRange(
  startTime: string | null,
  endTime: string | null
): string | null {
  const start = formatEventTime(startTime);
  if (!start) return null;
  if (!endTime) return start;

  const end = formatEventTime(endTime);
  if (!end) return start;

  const startPeriod = start.slice(-2);
  const endPeriod = end.slice(-2);
  const startLabel = startPeriod === endPeriod ? start.slice(0, -3) : start;
  return `${startLabel}–${end}`;
}
