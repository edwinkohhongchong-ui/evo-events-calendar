import { addDays } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { computeSpanDays } from "./eventSpan";
import { occurrenceKey, occurrenceKeyFor } from "./occurrenceKey";
import { EventOccurrence, EventRow } from "./types";

// What a delete asks the server to do: except one date of a recurring series,
// or delete the whole event row (and with it every occurrence).
export type DeleteRequest =
  | { scope: "occurrence"; event: EventRow; originalDate: string }
  | { scope: "series"; event: EventRow; lockToken?: string };

// A recurring event opened without a clicked occurrence (the overdue-checklist
// pill, or after an edit-conflict Reload) still gets the "only this event /
// all events" choice, anchored on the series' first date.
export function baseOccurrence(event: EventRow): EventOccurrence {
  const spanEnd = toDateStr(addDays(parseDateStr(event.event_date), computeSpanDays(event)));
  return {
    event,
    occurrenceDate: event.event_date,
    originalDate: event.event_date,
    isOverridden: false,
    startTime: event.event_time,
    endTime: event.end_time,
    spanEndDate: spanEnd,
  };
}

// The occurrence a delete's scope choice applies to, or undefined for a
// non-recurring event (simple confirm, nothing to choose).
export function deleteScopeOccurrence(event: EventRow, occurrence?: EventOccurrence): EventOccurrence | undefined {
  if (event.recurring === "None") return undefined;
  return occurrence ?? baseOccurrence(event);
}

// Key under which an in-flight delete hides its target from the calendar: the
// bare event id for a series (hides every occurrence), else one occurrence key.
export function deleteHideKey(req: DeleteRequest): string {
  return req.scope === "series" ? req.event.id : occurrenceKeyFor(req.event.id, req.originalDate);
}

export function withoutDeleted(occurrences: EventOccurrence[], hidden: ReadonlySet<string>): EventOccurrence[] {
  if (hidden.size === 0) return occurrences;
  return occurrences.filter((occ) => !hidden.has(occ.event.id) && !hidden.has(occurrenceKey(occ)));
}
