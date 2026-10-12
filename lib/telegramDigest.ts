import { addDays, differenceInCalendarDays, endOfMonth, format, startOfWeek } from "date-fns";
import { formatEventTime, parseDateStr, toDateStr } from "./dates";
import type { EventOccurrence, HolidayRow } from "./types";

// Pure builder for the automatic Sunday Telegram message. Not a "use server"
// file and no Supabase/network here: the cron route and the Reminders-page
// buttons load the data, then call buildDigest. Output is plain text (the
// message is sent without a parse_mode), so event names can't inject markup.

/** How far ahead big events are asked about, counted from today. */
export const LOOKAHEAD_WEEKS = 8;

/** Telegram allows 4096 characters per message; stay clear of the edge. */
export const MAX_MESSAGE_CHARS = 4000;

const NAME_MAX = 80;
const LEVEL_MAX = 30;
const NEXT_MONTH_ITEMS = 5;
// Next month's first items are only worth a section when this month is nearly over.
const QUIET_MONTH_AT_MOST = 3;

export interface ChecklistCount {
  total: number;
  open: number;
}

export interface DigestInput {
  /** Singapore calendar day, yyyy-MM-dd (see sgDateStr in lib/dates.ts). */
  today: string;
  /** Expanded occurrences with overrides already applied. */
  events: EventOccurrence[];
  holidays?: HolidayRow[];
  /** Event id -> event-checklist progress. Only used for one-off events. */
  checklistCounts?: ReadonlyMap<string, ChecklistCount>;
  /** Optional link to the calendar, added as the last line. */
  appUrl?: string;
}

// Control characters, bidi overrides and zero-width characters become a space
// (a pasted newline would otherwise forge extra lines in the message).
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanText(raw: unknown, max: number): string {
  const text = String(raw ?? "").replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const dayLabel = (dateStr: string) => format(parseDateStr(dateStr), "EEE d MMM");

function whenLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const weeks = Math.floor(days / 7);
  return `in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

interface Item {
  date: string;
  time: string | null;
  text: string;
  order: number;
}

function eventItem(occ: EventOccurrence): Item {
  const e = occ.event;
  const level = cleanText(e.level, LEVEL_MAX);
  const parts = [
    occ.startTime ? `${formatEventTime(occ.startTime)} ` : "",
    cleanText(e.name, NAME_MAX) || "(untitled)",
    e.event_type === "Gathering" ? " [Gathering]" : "",
    e.is_major ? " ★" : "",
    level ? ` (${level})` : "",
    occ.spanEndDate > occ.occurrenceDate ? `, until ${dayLabel(occ.spanEndDate)}` : "",
  ];
  return { date: occ.occurrenceDate, time: occ.startTime, text: parts.join(""), order: 1 };
}

function holidayItem(h: HolidayRow): Item {
  return { date: h.holiday_date, time: null, text: `${cleanText(h.name, NAME_MAX)} (holiday)`, order: 0 };
}

const byDateThenTime = (a: Item, b: Item) =>
  a.date.localeCompare(b.date) || a.order - b.order || (a.time ?? "").localeCompare(b.time ?? "") || a.text.localeCompare(b.text);

function weekSections(items: Item[]): string[] {
  const lines: string[] = [];
  let currentWeek = "";
  for (const item of [...items].sort(byDateThenTime)) {
    const week = toDateStr(startOfWeek(parseDateStr(item.date), { weekStartsOn: 1 }));
    if (week !== currentWeek) {
      currentWeek = week;
      lines.push("", `Week of ${format(parseDateStr(week), "EEE d MMM")}`);
    }
    lines.push(`- ${dayLabel(item.date)}: ${item.text}`);
  }
  return lines;
}

/** Splits lines into messages of at most `max` characters, breaking only between lines. */
export function chunkLines(lines: string[], max = MAX_MESSAGE_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const text = current.replace(/^\n+|\n+$/g, "");
    if (text) chunks.push(text);
    current = "";
  };
  for (const raw of lines) {
    const line = raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
    if (current.length + line.length + 1 > max) flush();
    current += `${line}\n`;
  }
  flush();
  return chunks;
}

export function buildDigest(input: DigestInput): string[] {
  const { today, events, holidays = [], checklistCounts, appUrl } = input;
  const todayDate = parseDateStr(today);
  const monthEnd = toDateStr(endOfMonth(todayDate));
  const nextMonthStart = toDateStr(addDays(endOfMonth(todayDate), 1));
  const nextMonthEnd = toDateStr(endOfMonth(parseDateStr(nextMonthStart)));
  const lookaheadEnd = toDateStr(addDays(todayDate, LOOKAHEAD_WEEKS * 7));

  const holidayItems = (from: string, to: string) =>
    holidays
      .filter((h) => h.holiday_date >= from && h.holiday_date <= to && h.type !== "School Schedule")
      .map(holidayItem);
  const eventItems = (from: string, to: string) =>
    events.filter((o) => o.occurrenceDate >= from && o.occurrenceDate <= to).map(eventItem);

  const lines: string[] = [`+EVO calendar — ${format(todayDate, "MMMM yyyy")}`];

  const thisMonth = [...eventItems(today, monthEnd), ...holidayItems(today, monthEnd)];
  lines.push("", "THIS MONTH (rest of the month)");
  if (thisMonth.length === 0) {
    lines.push("", "Nothing else is scheduled for the rest of this month yet. Have a blessed week!");
  } else {
    lines.push(...weekSections(thisMonth));
  }

  const remainingEvents = eventItems(today, monthEnd).length;
  if (remainingEvents <= QUIET_MONTH_AT_MOST) {
    const next = [...eventItems(nextMonthStart, nextMonthEnd), ...holidayItems(nextMonthStart, nextMonthEnd)]
      .sort(byDateThenTime)
      .slice(0, NEXT_MONTH_ITEMS);
    if (next.length > 0) {
      lines.push("", `COMING UP NEXT MONTH (${format(parseDateStr(nextMonthStart), "MMMM")})`);
      for (const item of next) lines.push(`- ${dayLabel(item.date)}: ${item.text}`);
    }
  }

  lines.push("", `PLANNING CHECK — big events in the next ${LOOKAHEAD_WEEKS} weeks`);
  const major = events
    .filter((o) => o.event.is_major && o.occurrenceDate >= today && o.occurrenceDate <= lookaheadEnd)
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.event.name.localeCompare(b.event.name));
  if (major.length === 0) {
    lines.push("", `No big events are flagged in the next ${LOOKAHEAD_WEEKS} weeks.`);
  }
  for (const occ of major) {
    const name = cleanText(occ.event.name, NAME_MAX) || "this event";
    const when = whenLabel(differenceInCalendarDays(parseDateStr(occ.occurrenceDate), todayDate));
    lines.push("", `★ ${name} — ${dayLabel(occ.occurrenceDate)} ${format(parseDateStr(occ.occurrenceDate), "yyyy")} (${when})`);
    lines.push(`Is everything in place for ${name} (${when})? Reply here with what's still needed.`);
    // A checklist belongs to the event row, so for a repeating series it
    // would be counted against every occurrence; only one-off events show it.
    const count = occ.event.recurring === "None" ? checklistCounts?.get(occ.event.id) : undefined;
    if (count && count.total > 0) {
      lines.push(
        count.open > 0
          ? `${count.open} of ${count.total} checklist items still open`
          : `All ${count.total} checklist items are done`
      );
    }
  }

  const link = typeof appUrl === "string" && /^https?:\/\/\S+$/.test(appUrl) ? appUrl : "";
  if (link) lines.push("", `Open the calendar: ${link}`);

  return chunkLines(lines);
}
