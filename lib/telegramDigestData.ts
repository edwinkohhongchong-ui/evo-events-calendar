import { addDays, endOfMonth, addMonths } from "date-fns";
import { supabase } from "./supabase";
import { parseDateStr, sgDateStr, toDateStr } from "./dates";
import { expandEvents } from "./recurrence";
import { applyOverrides } from "./overrides";
import { LOOKAHEAD_WEEKS, buildDigest, type ChecklistCount } from "./telegramDigest";
import type { EventRow, ExceptionRow, HolidayRow, OverrideRow } from "./types";

// Loads what the Sunday Telegram message needs and builds it. Not a "use
// server" file: callers (the cron route, the Reminders-page actions) do their
// own authorisation first.

const PAGE = 1000; // PostgREST returns at most this many rows per request

// Throws on a failed read: a partial event list would send the group a
// confident but wrong message. Supplementary reads use `optionalRows`.
async function readAll<T>(table: string, columns = "*"): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order("id").range(from, from + PAGE - 1);
    if (error) {
      console.error(`telegram digest: reading ${table} failed:`, error.message);
      throw new Error("Could not read the calendar. Please try again.");
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function optionalRows<T>(table: string, columns?: string): Promise<T[]> {
  try {
    return await readAll<T>(table, columns);
  } catch {
    return []; // already logged; the message is still useful without it
  }
}

/** Builds the message(s) for `now` (Singapore day). Throws if the core calendar data can't be read. */
export async function buildDigestMessages(now: Date = new Date(), appUrl?: string): Promise<string[]> {
  const today = sgDateStr(now);
  const todayDate = parseDateStr(today);
  const rangeEnd = toDateStr(
    new Date(Math.max(endOfMonth(addMonths(todayDate, 1)).getTime(), addDays(todayDate, LOOKAHEAD_WEEKS * 7).getTime()))
  );

  const [events, overrides, exceptions, holidays, items] = await Promise.all([
    readAll<EventRow>("events"),
    readAll<OverrideRow>("event_overrides"),
    readAll<ExceptionRow>("event_exceptions"),
    optionalRows<HolidayRow>("holidays"),
    optionalRows<{ event_id: string; done: boolean }>("event_checklist_items", "id, event_id, done"),
  ]);

  const exceptionsByEventId = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    const set = exceptionsByEventId.get(ex.event_id) ?? new Set<string>();
    set.add(ex.original_date);
    exceptionsByEventId.set(ex.event_id, set);
  }
  const expanded = expandEvents(events, todayDate, parseDateStr(rangeEnd), exceptionsByEventId);
  const occurrences = applyOverrides(expanded, overrides, new Map(events.map((e) => [e.id, e])), today, rangeEnd);

  const checklistCounts = new Map<string, ChecklistCount>();
  for (const it of items) {
    const c = checklistCounts.get(it.event_id) ?? { total: 0, open: 0 };
    c.total += 1;
    if (!it.done) c.open += 1;
    checklistCounts.set(it.event_id, c);
  }

  return buildDigest({ today, events: occurrences, holidays, checklistCounts, appUrl });
}
