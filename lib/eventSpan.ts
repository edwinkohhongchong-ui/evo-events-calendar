import { differenceInCalendarDays } from "date-fns";
import { parseDateStr } from "./dates";

// How many days a recurring event's template spans (0 = single-day) —
// preserved on every occurrence, same way event_time/duration_minutes are.
export function computeSpanDays(event: { event_date: string; end_date: string | null }): number {
  if (!event.end_date) return 0;
  return differenceInCalendarDays(parseDateStr(event.end_date), parseDateStr(event.event_date));
}
