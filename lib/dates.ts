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

// "Today" for this app is always the Singapore calendar day. The server runs in
// UTC, so between 00:00 and 08:00 SGT its own date is still yesterday.
const SG_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayStr(): string {
  return SG_DATE_FORMAT.format(new Date());
}

// Local-midnight Date for the Singapore day (same convention as parseDateStr).
export function todayDate(): Date {
  return parseDateStr(todayStr());
}

// Strict "yyyy-MM-dd" that is also a real calendar date (rejects 2026-02-30).
export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

// Clamps URL-supplied year/month into a safe range; non-numeric falls back to
// today's (Singapore) year/month.
export function clampYearMonth(year: unknown, month: unknown): { year: number; month: number } {
  const today = todayDate();
  let y = Number(year);
  let m = Number(month);
  if (!Number.isFinite(y) || !y) y = today.getFullYear();
  if (!Number.isFinite(m) || !m) m = today.getMonth() + 1;
  y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.trunc(y)));
  m = Math.min(12, Math.max(1, Math.trunc(m)));
  return { year: y, month: m };
}
