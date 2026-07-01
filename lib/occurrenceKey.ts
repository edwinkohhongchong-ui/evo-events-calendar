import { EventOccurrence } from "./types";

// Stable identity for an occurrence across drags — based on originalDate
// (the anchor-derived date), not occurrenceDate (which changes on override).
export function occurrenceKey(occurrence: EventOccurrence): string {
  return `${occurrence.event.id}::${occurrence.originalDate}`;
}
