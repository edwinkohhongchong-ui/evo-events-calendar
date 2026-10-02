import { differenceInCalendarDays } from "date-fns";
import { dueDate, isOverdue } from "./eventChecklist";
import { formatDateDisplay, parseDateStr } from "./dates";
import type { OpenChecklistRow } from "./types";

/**
 * Plain-text list of open overdue checklist items, grouped by event (soonest
 * event first, worst item first within an event). `today` is the Singapore
 * date string; overdue is decided by the same isOverdue rule as the calendar
 * badge, so an item due after the event (negative weeks_before) counts too.
 * Returns null when nothing is overdue.
 */
export function buildOverdueSummary(rows: OpenChecklistRow[], today: string): string | null {
  const now = parseDateStr(today);
  const groups = new Map<string, { name: string; date: string; items: { item: string; daysLate: number }[] }>();
  for (const row of rows) {
    if (!isOverdue(row.event.event_date, row.weeks_before, false, today)) continue;
    const due = dueDate(row.event.event_date, row.weeks_before)!;
    const g = groups.get(row.event.id) ?? { name: row.event.name, date: row.event.event_date, items: [] };
    g.items.push({ item: row.item, daysLate: differenceInCalendarDays(now, parseDateStr(due)) });
    groups.set(row.event.id, g);
  }
  if (groups.size === 0) return null;

  const sorted = Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const total = sorted.reduce((n, g) => n + g.items.length, 0);
  const lines = [`Overdue checklist items as of ${formatDateDisplay(today)} (${total} across ${sorted.length} ${sorted.length === 1 ? "event" : "events"})`];
  for (const g of sorted) {
    g.items.sort((a, b) => b.daysLate - a.daysLate || a.item.localeCompare(b.item));
    lines.push("", `${g.name} — ${formatDateDisplay(g.date)}`);
    for (const it of g.items) lines.push(`  - ${it.item} (${it.daysLate} ${it.daysLate === 1 ? "day" : "days"} overdue)`);
  }
  return lines.join("\n");
}
