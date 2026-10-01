import { addDays, differenceInCalendarDays } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { EventOccurrence } from "./types";

// Mirrors applyOverrideToOccurrence: moving an occurrence shifts its span end
// by the same number of days, so a single-day chip stays single-day and a
// multi-day bar keeps its length while the server round-trip is in flight.
export function withOptimisticMove(occ: EventOccurrence, newDate: string): EventOccurrence {
  const shift = differenceInCalendarDays(parseDateStr(newDate), parseDateStr(occ.occurrenceDate));
  return {
    ...occ,
    occurrenceDate: newDate,
    spanEndDate: toDateStr(addDays(parseDateStr(occ.spanEndDate), shift)),
  };
}
