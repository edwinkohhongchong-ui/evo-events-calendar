import { addWeeks, addMonths, addYears, isBefore, isAfter } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { EventRow, EventOccurrence, Recurring } from "./types";

function stepFor(recurring: Recurring): (d: Date) => Date {
  switch (recurring) {
    case "Weekly":
      return (d) => addWeeks(d, 1);
    case "Monthly":
      return (d) => addMonths(d, 1);
    case "Yearly":
      return (d) => addYears(d, 1);
    case "None":
      throw new Error("stepFor called with non-recurring event");
  }
}

// Expands a single event row into its occurrence(s) within [rangeStart, rangeEnd].
// exceptionDates holds this event's own excepted original dates (see
// event_exceptions, migration 007) — occurrences that were pulled out of the
// series by an "only this event" edit/delete and must not be regenerated.
export function expandEvent(
  event: EventRow,
  rangeStart: Date,
  rangeEnd: Date,
  exceptionDates: Set<string> = new Set()
): EventOccurrence[] {
  const anchor = parseDateStr(event.event_date);

  if (event.recurring === "None") {
    if (!isBefore(anchor, rangeStart) && !isAfter(anchor, rangeEnd)) {
      return [
        {
          event,
          occurrenceDate: event.event_date,
          originalDate: event.event_date,
          isOverridden: false,
          startTime: event.event_time,
          endTime: event.end_time,
        },
      ];
    }
    return [];
  }

  // null repeat_until = repeats indefinitely; safe to cap expansion at the
  // visible grid range since we only render one range at a time — don't
  // "fix" this into treating null as no-recurrence.
  const repeatUntil = event.repeat_until ? parseDateStr(event.repeat_until) : null;
  const effectiveEnd = repeatUntil && isBefore(repeatUntil, rangeEnd) ? repeatUntil : rangeEnd;

  if (isAfter(anchor, effectiveEnd)) return [];

  const step = stepFor(event.recurring);

  // Walk forward from the event's own anchor date (event_date), not from
  // rangeStart — starting the walk at an arbitrary grid boundary would
  // misalign Monthly/Yearly patterns (e.g. a "15th of every month" event
  // would drift off-pattern if we counted from rangeStart instead of the
  // real anchor date).
  let cur = anchor;
  while (isBefore(cur, rangeStart)) {
    cur = step(cur);
  }

  const occurrences: EventOccurrence[] = [];
  while (!isAfter(cur, effectiveEnd)) {
    const dateStr = toDateStr(cur);
    if (!exceptionDates.has(dateStr)) {
      occurrences.push({
        event,
        occurrenceDate: dateStr,
        originalDate: dateStr,
        isOverridden: false,
        startTime: event.event_time,
        endTime: event.end_time,
      });
    }
    cur = step(cur);
  }
  return occurrences;
}

export function expandEvents(
  events: EventRow[],
  rangeStart: Date,
  rangeEnd: Date,
  exceptionsByEventId: Map<string, Set<string>> = new Map()
): EventOccurrence[] {
  return events.flatMap((event) =>
    expandEvent(event, rangeStart, rangeEnd, exceptionsByEventId.get(event.id))
  );
}
