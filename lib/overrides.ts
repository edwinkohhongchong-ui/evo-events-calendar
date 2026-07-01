import { EventRow, EventOccurrence, OverrideRow } from "./types";

// Applies event_overrides on top of naturally-expanded occurrences. Overrides
// only ever change which date an occurrence renders on (see PROJECT decision:
// no per-occurrence field edits or cancellation in this phase).
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
      result.push({ ...occ, occurrenceDate: override.new_date, isOverridden: true });
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
    result.push({
      event: baseEvent,
      occurrenceDate: override.new_date,
      originalDate: override.original_date,
      isOverridden: true,
    });
  });

  return result;
}
