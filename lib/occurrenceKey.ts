import { EventOccurrence } from "./types";

// Stable identity for an occurrence across drags — based on originalDate
// (the anchor-derived date), not occurrenceDate (which changes on override).
export function occurrenceKey(occurrence: EventOccurrence): string {
  return occurrenceKeyFor(occurrence.event.id, occurrence.originalDate);
}

export function occurrenceKeyFor(eventId: string, originalDate: string): string {
  return `${eventId}::${originalDate}`;
}
