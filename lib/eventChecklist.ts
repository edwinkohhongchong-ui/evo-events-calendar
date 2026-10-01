import { addDays } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { ChecklistTemplateWithItems, EventChecklistItemRow, EventChecklistProgress } from "./types";

// Gathering types that get the checklist suggested (never applied silently).
export const SUGGESTED_TEMPLATE_BY_GATHERING_TYPE: Record<string, string> = {
  "+EVO YTH Big Day": "Big Event Prep",
  "Easter/XMAS": "Big Event Prep",
};

export interface ExpandedChecklistItem {
  item: string;
  weeks_before: number | null;
}

// Expands a template into per-event items. A repeated item (repeat_count > 1)
// becomes numbered rows ("— Week 1 of 4"); when it has a due offset, the first
// row is due that many weeks before the event and each later row one week
// later (never after the event day itself).
export function expandTemplateItems(template: ChecklistTemplateWithItems): ExpandedChecklistItem[] {
  const out: ExpandedChecklistItem[] = [];
  for (const it of template.items) {
    const count = Math.max(1, it.repeat_count ?? 1);
    for (let i = 1; i <= count; i++) {
      out.push({
        item: count > 1 ? `${it.item} — Week ${i} of ${count}` : it.item,
        weeks_before: it.weeks_before == null ? null : Math.max(0, it.weeks_before - (i - 1)),
      });
    }
  }
  return out;
}

// Due date is always derived from the event's current date, so it follows an
// event that gets dragged to another day.
export function dueDate(eventDate: string, weeksBefore: number | null): string | null {
  if (weeksBefore == null) return null;
  return toDateStr(addDays(parseDateStr(eventDate), -7 * weeksBefore));
}

export function isOverdue(eventDate: string, weeksBefore: number | null, done: boolean, todayStr: string): boolean {
  if (done) return false;
  const due = dueDate(eventDate, weeksBefore);
  return due !== null && due < todayStr;
}

export function progressOf(items: Pick<EventChecklistItemRow, "done" | "weeks_before">[]): EventChecklistProgress {
  let done = 0;
  let openWeeksBefore: number | null = null;
  for (const it of items) {
    if (it.done) {
      done += 1;
    } else if (it.weeks_before != null && (openWeeksBefore === null || it.weeks_before > openWeeksBefore)) {
      openWeeksBefore = it.weeks_before;
    }
  }
  return { done, total: items.length, openWeeksBefore };
}

export function progressOverdue(progress: EventChecklistProgress, eventDate: string, todayStr: string): boolean {
  return progress.openWeeksBefore !== null && isOverdue(eventDate, progress.openWeeksBefore, false, todayStr);
}
