import { supabase } from "./supabase";
import { parseDateStr, sgDateStr } from "./dates";
import { expandEvents } from "./recurrence";
import { applyOverrides } from "./overrides";
import { buildDigest, requiredLoadEnd, type ChecklistCount, type DigestChecklistItem } from "./telegramDigest";
import type { DigestConfig } from "./telegramDigestConfig";
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

type ChecklistRow = DigestChecklistItem & { event_id: string };

// Best-effort: the owner column only exists from migration 025, so retry
// without it before giving up (the message is still sent without checklists).
async function readChecklistItems(): Promise<ChecklistRow[]> {
  const base = "id, event_id, item, done, weeks_before, sort_order";
  try {
    return await readAll<ChecklistRow>("event_checklist_items", `${base}, owner`);
  } catch {
    return optionalRows<ChecklistRow>("event_checklist_items", base);
  }
}

/**
 * Builds the message(s) for `now` (Singapore day), for a configured digest or
 * (no config) the built-in Sunday one. Throws if the core calendar data can't
 * be read. An edited message needs no calendar data, so none is read for it.
 */
export async function buildDigestMessages(now: Date = new Date(), appUrl?: string, config?: DigestConfig): Promise<string[]> {
  const today = sgDateStr(now);
  if (config?.override_text) return buildDigest({ today, events: [], config });
  const todayDate = parseDateStr(today);
  const rangeEnd = requiredLoadEnd(today, [config]);

  const [events, overrides, exceptions, holidays, items] = await Promise.all([
    readAll<EventRow>("events"),
    readAll<OverrideRow>("event_overrides"),
    readAll<ExceptionRow>("event_exceptions"),
    optionalRows<HolidayRow>("holidays"),
    readChecklistItems(),
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
  const checklistItems = new Map<string, DigestChecklistItem[]>();
  for (const it of items) {
    const list = checklistItems.get(it.event_id) ?? [];
    list.push(it);
    checklistItems.set(it.event_id, list);
    const c = checklistCounts.get(it.event_id) ?? { total: 0, open: 0 };
    c.total += 1;
    if (!it.done) c.open += 1;
    checklistCounts.set(it.event_id, c);
  }

  return buildDigest({ today, events: occurrences, holidays, checklistCounts, checklistItems, appUrl, config });
}
