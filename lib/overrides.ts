import { differenceInCalendarDays, addDays } from "date-fns";
import { EventRow, EventOccurrence, OverrideRow } from "./types";
import { computeEndTime } from "./timeMath";
import { parseDateStr, toDateStr } from "./dates";
import { computeSpanDays } from "./eventSpan";

// Applies an override's date/time/span deviation on top of an already-
// expanded occurrence. new_date is always applied (it's always concrete —
// see PROJECT decision on migration 005). new_time, when set, also
// recomputes the effective end time from the base event's duration_minutes,
// so a retimed occurrence keeps its original length.
//
// Span end date: a plain date-move (new_date changed, no new_end_date) also
// shifts the span end by the same number of days, so moving an already
// multi-day occurrence preserves its length — matching how dragging a card
// preserves duration elsewhere. An explicit new_end_date (from the
// drag-to-resize handle) overrides that and wins outright.
function applyOverrideToOccurrence(occ: EventOccurrence, override: OverrideRow): EventOccurrence {
  const startTime = override.new_time ?? occ.event.event_time;
  const endTime =
    override.new_time != null
      ? occ.event.duration_minutes != null
        ? computeEndTime(override.new_time, occ.event.duration_minutes)
        : null
      : occ.event.end_time;

  const dateShiftDays = differenceInCalendarDays(
    parseDateStr(override.new_date),
    parseDateStr(occ.originalDate)
  );
  const shiftedSpanEndDate = toDateStr(addDays(parseDateStr(occ.spanEndDate), dateShiftDays));

  return {
    ...occ,
    occurrenceDate: override.new_date,
    startTime,
    endTime,
    isOverridden: true,
    spanEndDate: override.new_end_date ?? shiftedSpanEndDate,
  };
}

// Applies event_overrides on top of naturally-expanded occurrences. An
// override can shift an occurrence's date, its time, its span, or any
// combination.
export function applyOverrides(
  occurrences: EventOccurrence[],
  overrides: OverrideRow[],
  eventsById: Map<string, EventRow>,
  gridStartStr: string,
  gridEndStr: string
): EventOccurrence[] {
  const overridesByKey = new Map<string, OverrideRow>();
  for (const override of overrides) {
    overridesByKey.set(`${override.event_id}::${override.original_date}`, override);
  }

  const matchedKeys = new Set<string>();
  const result: EventOccurrence[] = [];

  for (const occ of occurrences) {
    const key = `${occ.event.id}::${occ.originalDate}`;
    const override = overridesByKey.get(key);
    if (!override) {
      result.push(occ);
      continue;
    }
    matchedKeys.add(key);
    if (override.new_date >= gridStartStr && override.new_date <= gridEndStr) {
      result.push(applyOverrideToOccurrence(occ, override));
    }
    // else: dragged out of this grid's visible range — omitted from this render.
  }

  // Overrides whose natural occurrence date fell outside this grid (so
  // expandEvent never generated it here) but whose new_date was dragged into
  // this grid's visible range from elsewhere.
  overridesByKey.forEach((override, key) => {
    if (matchedKeys.has(key)) return;
    if (override.new_date < gridStartStr || override.new_date > gridEndStr) return;
    const baseEvent = eventsById.get(override.event_id);
    if (!baseEvent) {
      // Base event wasn't included in this range's coarse fetch — e.g. its
      // repeat_until ended before this grid started, but one of its last
      // occurrences was dragged forward into this grid anyway. Known edge
      // case; the occurrence won't render here. Not handled in this phase.
      return;
    }
    result.push(
      applyOverrideToOccurrence(
        {
          event: baseEvent,
          occurrenceDate: override.original_date,
          originalDate: override.original_date,
          isOverridden: false,
          startTime: baseEvent.event_time,
          endTime: baseEvent.end_time,
          // Natural span for THIS occurrence (series length from its own natural
          // date), not the anchor's end_date; applyOverrideToOccurrence then
          // shifts it with the date move, as recurrence.ts does for the first pass.
          spanEndDate: toDateStr(addDays(parseDateStr(override.original_date), computeSpanDays(baseEvent))),
        },
        override
      )
    );
  });

  return result;
}
