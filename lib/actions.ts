import { supabase } from "./supabase";
import { EventRow, Level, Recurring } from "./types";

// Moves a single occurrence to newDate.
// - Non-recurring: updates the event row's event_date directly.
// - Recurring: writes an event_overrides row instead of touching the base
//   event, keyed by originalDate (the natural, anchor-derived date) so
//   dragging the same occurrence again updates this same override row.
//   Dragging it back to its natural date deletes the override rather than
//   storing a no-op row.
export async function moveOccurrence(
  event: EventRow,
  originalDate: string,
  newDate: string
): Promise<void> {
  if (event.recurring === "None") {
    const { error } = await supabase
      .from("events")
      .update({ event_date: newDate })
      .eq("id", event.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (newDate === originalDate) {
    const { error } = await supabase
      .from("event_overrides")
      .delete()
      .eq("event_id", event.id)
      .eq("original_date", originalDate);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("event_overrides")
    .upsert(
      { event_id: event.id, original_date: originalDate, new_date: newDate },
      { onConflict: "event_id,original_date" }
    );
  if (error) throw new Error(error.message);
}

export interface EventFormValues {
  name: string;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  level: Level;
  recurring: Recurring;
  repeat_until: string | null;
  notes: string | null;
}

export async function createEvent(values: EventFormValues): Promise<void> {
  const { error } = await supabase.from("events").insert(values);
  if (error) throw new Error(error.message);
}

export async function updateEvent(id: string, values: EventFormValues): Promise<void> {
  const { error } = await supabase.from("events").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

// Deletes the base event row. event_overrides.event_id has ON DELETE CASCADE,
// so any per-occurrence overrides for this event are cleaned up automatically.
// For a recurring event this deletes the whole series — the confirmation UI
// is responsible for making that unambiguous before calling this.
export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
