import { addDays } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { computeSpanDays } from "./eventSpan";
import { EventRow, ExceptionRow, OverrideRow } from "./types";

// Singapore has been a fixed UTC+8 with no DST since 1982 — a single
// STANDARD component covers every date this app will ever export.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Singapore",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0800",
  "TZOFFSETTO:+0800",
  "TZNAME:+08",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function icsDateTime(dateStr: string, timeStr: string): string {
  const [hh, mm, ss] = timeStr.split(":");
  return `${icsDate(dateStr)}T${hh}${mm}${(ss ?? "00").padStart(2, "0")}`;
}

// UNTIL must be UTC when DTSTART carries a TZID (RFC 5545) — 23:59:59 SGT
// is 15:59:59 UTC the same calendar date, since Singapore is a fixed +08:00.
function icsUntilUtc(dateStr: string, hasTime: boolean): string {
  return hasTime ? `${icsDate(dateStr)}T155959Z` : icsDate(dateStr);
}

function dtStartEnd(
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null
): string[] {
  if (startTime) {
    const effectiveEndTime = endTime ?? startTime;
    return [
      `DTSTART;TZID=Asia/Singapore:${icsDateTime(startDate, startTime)}`,
      `DTEND;TZID=Asia/Singapore:${icsDateTime(endDate, effectiveEndTime)}`,
    ];
  }
  // All-day: DTEND is exclusive per RFC 5545, so a single-day event's end is
  // the next calendar day, not the same day repeated.
  const exclusiveEnd = toDateStr(addDays(parseDateStr(endDate), 1));
  return [`DTSTART;VALUE=DATE:${icsDate(startDate)}`, `DTEND;VALUE=DATE:${icsDate(exclusiveEnd)}`];
}

function dtStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours()
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

// The recurring series itself — occurrences that were individually moved,
// retimed, resized, or detached are excluded here (EXDATE) and re-emitted
// as their own standalone VEVENTs below, rather than using RECURRENCE-ID
// overrides (simpler, and calendar clients handle plain VEVENTs uniformly).
function buildSeriesEvent(event: EventRow, excludedDates: string[]): string[] {
  const hasTime = !!event.event_time;
  const spanDays = computeSpanDays(event);
  const naturalEnd = toDateStr(addDays(parseDateStr(event.event_date), spanDays));

  const lines: string[] = ["BEGIN:VEVENT", `UID:${event.id}@evo-events-calendar`, `DTSTAMP:${dtStamp()}`];
  lines.push(...dtStartEnd(event.event_date, naturalEnd, event.event_time, event.end_time));
  lines.push(`SUMMARY:${escapeIcsText(event.name)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);

  if (event.recurring !== "None") {
    let rrule = `FREQ=${event.recurring.toUpperCase()}`;
    if (event.repeat_until) rrule += `;UNTIL=${icsUntilUtc(event.repeat_until, hasTime)}`;
    lines.push(`RRULE:${rrule}`);

    if (excludedDates.length > 0) {
      const values = excludedDates
        .map((d) => (hasTime ? icsDateTime(d, event.event_time!) : icsDate(d)))
        .join(",");
      lines.push(hasTime ? `EXDATE;TZID=Asia/Singapore:${values}` : `EXDATE;VALUE=DATE:${values}`);
    }
  }

  lines.push("END:VEVENT");
  return lines;
}

// One moved/retimed/resized occurrence, exported as its own one-off event.
function buildOverrideEvent(event: EventRow, override: OverrideRow): string[] {
  const effectiveTime = override.new_time ?? event.event_time;
  const naturalSpanDays = computeSpanDays(event);
  const effectiveEnd =
    override.new_end_date ?? toDateStr(addDays(parseDateStr(override.new_date), naturalSpanDays));

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${event.id}-${override.original_date}@evo-events-calendar`,
    `DTSTAMP:${dtStamp()}`,
  ];
  lines.push(...dtStartEnd(override.new_date, effectiveEnd, effectiveTime, event.end_time));
  lines.push(`SUMMARY:${escapeIcsText(event.name)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);
  lines.push("END:VEVENT");
  return lines;
}

// Builds a complete .ics file for every event in the calendar — recurring
// series as RRULEs (with EXDATE for excepted/overridden occurrences),
// one-off events plainly, and moved/retimed/resized occurrences as their
// own standalone events. Apple Calendar and Google Calendar both import
// this format directly.
export function buildIcsCalendar(
  events: EventRow[],
  overrides: OverrideRow[],
  exceptions: ExceptionRow[]
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//+EVO Events Calendar//EN",
    "CALSCALE:GREGORIAN",
    ...VTIMEZONE,
  ];

  for (const event of events) {
    const eventOverrides = overrides.filter((o) => o.event_id === event.id);
    const eventExceptions = exceptions.filter((ex) => ex.event_id === event.id);
    const excludedDates = Array.from(
      new Set([...eventExceptions.map((ex) => ex.original_date), ...eventOverrides.map((o) => o.original_date)])
    );

    lines.push(...buildSeriesEvent(event, excludedDates));
    for (const override of eventOverrides) {
      lines.push(...buildOverrideEvent(event, override));
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
