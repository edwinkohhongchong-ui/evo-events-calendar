import { supabase } from "./supabase";
import { computeEndTime, timeStrToMinutes } from "./timeMath";
import { EventRow, Level, Recurring } from "./types";

// Moves a single occurrence to newDate. Never touches new_time — the upsert
// below only ever sends event_id/original_date/new_date, so PostgREST's
// merge-duplicates upsert leaves an existing new_time (set by a day-view
// retime) untouched on conflict.
//
// - Non-recurring: updates the event row's event_date directly.
// - Recurring: writes an event_overrides row instead of touching the base
//   event, keyed by originalDate (the natural, anchor-derived date) so
//   dragging the same occurrence again updates this same override row.
//   The row is only deleted when BOTH date and time are back to natural —
//   dragging the date back while a time override still exists must keep
//   the row (just with new_date reset), not destroy the time override too.
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

  const { data: existing, error: fetchError } = await supabase
    .from("event_overrides")
    .select("id, new_time")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const hasTimeOverride = existing?.new_time != null;

  if (newDate === originalDate && !hasTimeOverride) {
    if (existing) {
      const { error } = await supabase.from("event_overrides").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
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

// Retimes a single occurrence to newTime (start time only — date is never
// touched here; that's exclusively moveOccurrence's job). Mirrors
// moveOccurrence's shape and the same "only delete when fully natural on
// both axes" rule.
//
// - Non-recurring: updates the base row's event_time directly, recomputing
//   end_time from duration_minutes so the event keeps its length.
// - Recurring: writes/updates event_overrides.new_time, preserving whatever
//   new_date already exists on that row (never included in this function's
//   writes, so a prior date override survives a retime).
export async function retimeOccurrence(
  event: EventRow,
  originalDate: string,
  newTime: string
): Promise<void> {
  if (event.recurring === "None") {
    const { error } = await supabase
      .from("events")
      .update({
        event_time: newTime,
        end_time:
          event.duration_minutes != null ? computeEndTime(newTime, event.duration_minutes) : null,
      })
      .eq("id", event.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("event_overrides")
    .select("id, new_date")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const dateIsNatural = !existing || existing.new_date === originalDate;
  // Compare by minute value, not string equality — event.event_time is
  // stored as "HH:mm:ss" but computed drag times are "HH:mm", so a strict
  // string comparison would never match even when genuinely back to natural.
  const timeIsNatural =
    event.event_time != null && timeStrToMinutes(newTime) === timeStrToMinutes(event.event_time);

  if (timeIsNatural && dateIsNatural) {
    if (existing) {
      const { error } = await supabase.from("event_overrides").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("event_overrides")
      .update({ new_time: timeIsNatural ? null : newTime })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("event_overrides").insert({
    event_id: event.id,
    original_date: originalDate,
    new_date: originalDate,
    new_time: newTime,
  });
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
