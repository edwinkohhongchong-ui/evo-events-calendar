import { addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format, startOfWeek } from "date-fns";
import { formatEventTime, parseDateStr, toDateStr } from "./dates";
import { dueDate } from "./eventChecklist";
import type { DigestConfig } from "./telegramDigestConfig";
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
const CHECKLIST_ITEM_MAX = 80;
const CHECKLIST_OWNER_MAX = 30;
/** Open checklist items listed per event before "+N more open". */
export const CHECKLIST_OPEN_ITEMS_MAX = 8;
const NEXT_MONTH_ITEMS = 5;
// Next month's first items are only worth a section when this month is nearly over.
const QUIET_MONTH_AT_MOST = 3;

export interface ChecklistCount {
  total: number;
  open: number;
}

/** The few checklist fields a digest may show (item text, owner, done, due offset). */
export interface DigestChecklistItem {
  item: string;
  owner?: string | null;
  done: boolean;
  weeks_before: number | null;
  sort_order?: number | null;
}

export interface DigestInput {
  /** Singapore calendar day, yyyy-MM-dd (see sgDateStr in lib/dates.ts). */
  today: string;
  /** Expanded occurrences with overrides already applied. */
  events: EventOccurrence[];
  holidays?: HolidayRow[];
  /** Event id -> event-checklist progress. Only used for one-off events. */
  checklistCounts?: ReadonlyMap<string, ChecklistCount>;
  /** Event id -> its checklist items. Used by configured digests that show checklists. */
  checklistItems?: ReadonlyMap<string, DigestChecklistItem[]>;
  /** Optional link to the calendar, added as the last line. */
  appUrl?: string;
  /** A configured digest (migration 029). Omitted = the built-in Sunday message. */
  config?: DigestConfig;
}

// Control characters, bidi overrides and zero-width characters become a space
// (a pasted newline would otherwise forge extra lines in the message).
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const UNSAFE_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanText(raw: unknown, max: number): string {
  const text = String(raw ?? "").replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Like cleanText but keeps line breaks (for the intro/closing lines and an
 * edited message): control/bidi/zero-width characters become a space, runs of
 * blank lines collapse to one, and `max` is only applied when given.
 */
export function cleanMultiline(raw: unknown, max?: number): string {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(UNSAFE_CHARS_KEEP_NEWLINE, " ")
    .split("\n")
    .map((l) => l.replace(/[ ]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return max !== undefined && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** End of the period a digest lists events for (inclusive, yyyy-MM-dd). */
export function digestRangeEnd(today: string, config?: Pick<DigestConfig, "range_mode" | "range_days">): string {
  const todayDate = parseDateStr(today);
  if (config?.range_mode === "this_week") return toDateStr(endOfWeek(todayDate, { weekStartsOn: 1 }));
  if (config?.range_mode === "next_days") return toDateStr(addDays(todayDate, Math.max(1, config.range_days) - 1));
  return toDateStr(endOfMonth(todayDate));
}

/**
 * How far ahead the data must be loaded so every given digest (or the
 * built-in one, for `undefined`) can be built: the farthest of its range,
 * next month's end (the built-in "coming up" section) and its big-event window.
 */
export function requiredLoadEnd(today: string, configs: ReadonlyArray<DigestConfig | undefined>): string {
  const todayDate = parseDateStr(today);
  const ends: string[] = [];
  for (const c of configs.length ? configs : [undefined]) {
    ends.push(digestRangeEnd(today, c));
    if (!c || c.range_mode === "rest_of_month") ends.push(toDateStr(endOfMonth(addDays(endOfMonth(todayDate), 1))));
    if (!c || c.include_big_events) ends.push(toDateStr(addDays(todayDate, (c?.big_lookahead_weeks ?? LOOKAHEAD_WEEKS) * 7)));
  }
  return ends.reduce((a, b) => (a > b ? a : b));
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
  occ?: EventOccurrence;
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
  return { date: occ.occurrenceDate, time: occ.startTime, text: parts.join(""), order: 1, occ };
}

function holidayItem(h: HolidayRow): Item {
  return { date: h.holiday_date, time: null, text: `${cleanText(h.name, NAME_MAX)} (holiday)`, order: 0 };
}

const byDateThenTime = (a: Item, b: Item) =>
  a.date.localeCompare(b.date) || a.order - b.order || (a.time ?? "").localeCompare(b.time ?? "") || a.text.localeCompare(b.text);

const sortedOpen = (items: DigestChecklistItem[]) =>
  items
    .filter((i) => !i.done)
    // Earliest due first (a bigger weeks_before is due earlier); undated last.
    .sort(
      (a, b) =>
        (a.weeks_before == null ? 1 : 0) - (b.weeks_before == null ? 1 : 0) ||
        (b.weeks_before ?? 0) - (a.weeks_before ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

/** Indented checklist lines for one event, or [] when it has none. */
function checklistBlock(items: DigestChecklistItem[] | undefined, eventDate: string, today: string): string[] {
  if (!items || items.length === 0) return [];
  const total = items.length;
  const open = sortedOpen(items);
  if (open.length === 0) return [`  Checklist ✓ ${total}/${total} done`];
  const lines = [`  Checklist ${total - open.length}/${total} done`];
  for (const it of open.slice(0, CHECKLIST_OPEN_ITEMS_MAX)) {
    const parts = [`  ☐ ${cleanText(it.item, CHECKLIST_ITEM_MAX) || "(untitled)"}`];
    const owner = cleanText(it.owner, CHECKLIST_OWNER_MAX);
    if (owner) parts.push(`owner ${owner}`);
    const due = dueDate(eventDate, it.weeks_before);
    if (due) parts.push(`due ${format(parseDateStr(due), "d MMM")}${due < today ? " (overdue)" : ""}`);
    lines.push(parts.join(" — "));
  }
  if (open.length > CHECKLIST_OPEN_ITEMS_MAX) lines.push(`  +${open.length - CHECKLIST_OPEN_ITEMS_MAX} more open`);
  return lines;
}

function weekSections(items: Item[], extra: (item: Item) => string[]): string[] {
  const lines: string[] = [];
  let currentWeek = "";
  for (const item of [...items].sort(byDateThenTime)) {
    const week = toDateStr(startOfWeek(parseDateStr(item.date), { weekStartsOn: 1 }));
    if (week !== currentWeek) {
      currentWeek = week;
      lines.push("", `Week of ${format(parseDateStr(week), "EEE d MMM")}`);
    }
    lines.push(`- ${dayLabel(item.date)}: ${item.text}`, ...extra(item));
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

const sameLevel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function buildDigest(input: DigestInput): string[] {
  const { today, events: allEvents, holidays = [], checklistCounts, checklistItems, appUrl, config } = input;

  // An edited message replaces everything generated; it is still cleaned and chunked.
  const edited = config?.override_text ? cleanMultiline(config.override_text) : "";
  if (edited) return chunkLines(edited.split("\n"));

  const todayDate = parseDateStr(today);
  const rangeEnd = digestRangeEnd(today, config);
  const bigWeeks = config?.big_lookahead_weeks ?? LOOKAHEAD_WEEKS;
  const lookaheadEnd = toDateStr(addDays(todayDate, bigWeeks * 7));
  const nextMonthStart = toDateStr(addDays(endOfMonth(todayDate), 1));
  const nextMonthEnd = toDateStr(endOfMonth(parseDateStr(nextMonthStart)));

  const levelFilter = config?.levels ?? [];
  const events = allEvents.filter((o) => {
    if (config) {
      const gathering = o.event.event_type === "Gathering";
      if (gathering ? !config.include_gatherings : !config.include_events) return false;
    }
    return levelFilter.length === 0 || levelFilter.some((l) => sameLevel(l, String(o.event.level ?? "")));
  });

  const holidayItems = (from: string, to: string) =>
    holidays
      .filter((h) => h.holiday_date >= from && h.holiday_date <= to && h.type !== "School Schedule")
      .map(holidayItem);
  const eventItems = (from: string, to: string) =>
    events.filter((o) => o.occurrenceDate >= from && o.occurrenceDate <= to).map(eventItem);

  // Checklists are shared per event row, so a repeating series shows its
  // checklist once (on its first listed occurrence); due dates follow that date.
  const showChecklists = !!config && config.include_checklist_counts && !!checklistItems;
  const seriesShown = new Set<string>();
  const checklistFor = (occ?: EventOccurrence): string[] => {
    if (!showChecklists || !occ) return [];
    const id = occ.event.id;
    if (occ.event.recurring !== "None") {
      if (seriesShown.has(id)) return [];
      seriesShown.add(id);
    }
    return checklistBlock(checklistItems!.get(id), occ.occurrenceDate, today);
  };

  const lines: string[] = [];
  const intro = config?.intro ? cleanMultiline(config.intro) : "";
  if (intro) lines.push(...intro.split("\n"), "");
  lines.push(`+EVO calendar — ${format(todayDate, "MMMM yyyy")}`);

  const mode = config?.range_mode ?? "rest_of_month";
  const days = config?.range_days ?? 0;
  const heading =
    mode === "this_week" ? "THIS WEEK" : mode === "next_days" ? `NEXT ${days} ${days === 1 ? "DAY" : "DAYS"}` : "THIS MONTH (rest of the month)";
  const emptyLine =
    mode === "this_week"
      ? "Nothing else is scheduled for the rest of this week yet. Have a blessed week!"
      : mode === "next_days"
        ? `Nothing is scheduled for the next ${days} ${days === 1 ? "day" : "days"} yet. Have a blessed week!`
        : "Nothing else is scheduled for the rest of this month yet. Have a blessed week!";

  const inRange = [...eventItems(today, rangeEnd), ...holidayItems(today, rangeEnd)];
  lines.push("", heading);
  if (inRange.length === 0) {
    lines.push("", emptyLine);
  } else {
    lines.push(...weekSections(inRange, (i) => checklistFor(i.occ)));
  }

  if (mode === "rest_of_month") {
    const remainingEvents = eventItems(today, rangeEnd).length;
    if (remainingEvents <= QUIET_MONTH_AT_MOST) {
      const next = [...eventItems(nextMonthStart, nextMonthEnd), ...holidayItems(nextMonthStart, nextMonthEnd)]
        .sort(byDateThenTime)
        .slice(0, NEXT_MONTH_ITEMS);
      if (next.length > 0) {
        lines.push("", `COMING UP NEXT MONTH (${format(parseDateStr(nextMonthStart), "MMMM")})`);
        for (const item of next) lines.push(`- ${dayLabel(item.date)}: ${item.text}`, ...checklistFor(item.occ));
      }
    }
  }

  if (config?.include_big_events ?? true) {
    lines.push("", `PLANNING CHECK — big events in the next ${bigWeeks} weeks`);
    const major = events
      .filter((o) => o.event.is_major && o.occurrenceDate >= today && o.occurrenceDate <= lookaheadEnd)
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.event.name.localeCompare(b.event.name));
    if (major.length === 0) {
      lines.push("", `No big events are flagged in the next ${bigWeeks} weeks.`);
    }
    for (const occ of major) {
      const name = cleanText(occ.event.name, NAME_MAX) || "this event";
      const when = whenLabel(differenceInCalendarDays(parseDateStr(occ.occurrenceDate), todayDate));
      lines.push("", `★ ${name} — ${dayLabel(occ.occurrenceDate)} ${format(parseDateStr(occ.occurrenceDate), "yyyy")} (${when})`);
      lines.push(`Is everything in place for ${name} (${when})? Reply here with what's still needed.`);
      if (showChecklists) {
        lines.push(...checklistFor(occ));
        continue;
      }
      // A checklist belongs to the event row, so for a repeating series it
      // would be counted against every occurrence; only one-off events show it.
      const count = occ.event.recurring === "None" && (config?.include_checklist_counts ?? true) ? checklistCounts?.get(occ.event.id) : undefined;
      if (count && count.total > 0) {
        lines.push(
          count.open > 0
            ? `${count.open} of ${count.total} checklist items still open`
            : `All ${count.total} checklist items are done`
        );
      }
    }
  }

  const link = typeof appUrl === "string" && /^https?:\/\/\S+$/.test(appUrl) ? appUrl : "";
  if (link) lines.push("", `Open the calendar: ${link}`);
  const outro = config?.outro ? cleanMultiline(config.outro) : "";
  if (outro) lines.push("", ...outro.split("\n"));

  return chunkLines(lines);
}
