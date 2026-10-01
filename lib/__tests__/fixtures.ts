import { EventOccurrence, EventRow, Recurring } from "../types";

export function makeEvent(o: Partial<EventRow> & { event_date: string; recurring?: Recurring }): EventRow {
  return {
    id: "evt-1", name: "Test", end_date: null, event_time: "09:00:00", end_time: "10:00:00",
    duration_minutes: 60, level: "Churchwide", recurring: "None", repeat_until: null, notes: null,
    created_at: "2026-01-01T00:00:00.000Z", event_type: "Event",
    pastoral_youth: false, pastoral_poly: false, pastoral_uni: false, pastoral_adults: false,
    location: null, gathering_type: null, series: null, preacher_name: null, sermon_title: null, theme: null,
    ...o,
  } as EventRow;
}

export function makeOcc(event: EventRow, date: string, spanEnd?: string): EventOccurrence {
  return {
    event, occurrenceDate: date, originalDate: date, isOverridden: false,
    startTime: event.event_time, endTime: event.end_time, spanEndDate: spanEnd ?? date,
  };
}
