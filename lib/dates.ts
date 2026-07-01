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
