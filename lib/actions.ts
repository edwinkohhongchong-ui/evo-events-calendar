import { subDays } from "date-fns";
import { supabase } from "./supabase";
import { computeEndTime, timeStrToMinutes } from "./timeMath";
import { parseDateStr, toDateStr } from "./dates";
import { EventRow, EventType, Level, Recurring } from "./types";

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
  event_type: EventType;
  pastoral_youth: boolean;
  pastoral_poly: boolean;
  pastoral_uni: boolean;
  pastoral_adults: boolean;
  series: string | null;
  preacher_name: string | null;
  sermon_title: string | null;
  theme: string | null;
}

export async function createEvent(values: EventFormValues): Promise<void> {
  const { error } = await supabase.from("events").insert(values);
  if (error) throw new Error(error.message);
}

export async function updateEvent(id: string, values: EventFormValues): Promise<void> {
  const { error } = await supabase.from("events").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

// Deletes the base event row. event_overrides/event_exceptions have ON
// DELETE CASCADE on event_id, so any per-occurrence overrides/exceptions for
// this event are cleaned up automatically. For a recurring event this
// deletes the whole series — the confirmation UI is responsible for making
// that unambiguous before calling this.
export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// "Only this event" edit: pulls one occurrence of a recurring series out
// into its own standalone event carrying the edited values, and excepts the
// original date so the series stops generating it. The rest of the series
// (before and after) is untouched.
export async function detachOccurrence(
  event: EventRow,
  originalDate: string,
  values: EventFormValues
): Promise<void> {
  const { error: insertError } = await supabase
    .from("events")
    .insert({ ...values, recurring: "None", repeat_until: null });
  if (insertError) throw new Error(insertError.message);

  const { error: exceptionError } = await supabase
    .from("event_exceptions")
    .upsert({ event_id: event.id, original_date: originalDate }, { onConflict: "event_id,original_date" });
  if (exceptionError) throw new Error(exceptionError.message);

  // Any prior date/time-only override on this occurrence is superseded by
  // the standalone event's own fields — remove it so it doesn't linger.
  const { error: deleteOverrideError } = await supabase
    .from("event_overrides")
    .delete()
    .eq("event_id", event.id)
    .eq("original_date", originalDate);
  if (deleteOverrideError) throw new Error(deleteOverrideError.message);
}

// "This and all future events" edit: shortens the original series to end
// the day before this occurrence, then starts a new series from this
// occurrence carrying the edited values. Occurrences before the split stay
// on the original event untouched; overrides/exceptions strictly after the
// split point move to the new series (they still describe real deviations
// under it) — the one exactly on the split date is dropped, since the new
// series' own fields already reflect it directly.
export async function splitSeriesFromOccurrence(
  event: EventRow,
  originalDate: string,
  values: EventFormValues
): Promise<void> {
  // Editing the very first occurrence "and all future" has nothing to
  // preserve before it — same as editing the whole series in place.
  if (originalDate === event.event_date) {
    await updateEvent(event.id, values);
    return;
  }

  const cutoff = toDateStr(subDays(parseDateStr(originalDate), 1));
  const { error: shortenError } = await supabase
    .from("events")
    .update({ repeat_until: cutoff })
    .eq("id", event.id);
  if (shortenError) throw new Error(shortenError.message);

  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert(values)
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  const newEventId = inserted.id as string;

  const { error: overrideMigrateError } = await supabase
    .from("event_overrides")
    .update({ event_id: newEventId })
    .eq("event_id", event.id)
    .gt("original_date", originalDate);
  if (overrideMigrateError) throw new Error(overrideMigrateError.message);

  const { error: overrideDeleteError } = await supabase
    .from("event_overrides")
    .delete()
    .eq("event_id", event.id)
    .eq("original_date", originalDate);
  if (overrideDeleteError) throw new Error(overrideDeleteError.message);

  const { error: exceptionMigrateError } = await supabase
    .from("event_exceptions")
    .update({ event_id: newEventId })
    .eq("event_id", event.id)
    .gt("original_date", originalDate);
  if (exceptionMigrateError) throw new Error(exceptionMigrateError.message);
}

// "Only this event" delete: excepts the occurrence so the series stops
// generating it, without touching the series or any other occurrence.
export async function deleteOccurrence(event: EventRow, originalDate: string): Promise<void> {
  const { error: exceptionError } = await supabase
    .from("event_exceptions")
    .upsert({ event_id: event.id, original_date: originalDate }, { onConflict: "event_id,original_date" });
  if (exceptionError) throw new Error(exceptionError.message);

  const { error: deleteOverrideError } = await supabase
    .from("event_overrides")
    .delete()
    .eq("event_id", event.id)
    .eq("original_date", originalDate);
  if (deleteOverrideError) throw new Error(deleteOverrideError.message);
}
