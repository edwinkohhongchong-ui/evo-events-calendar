import { addDays, subDays } from "date-fns";
import { supabase } from "./supabase";
import { computeEndTime, timeStrToMinutes } from "./timeMath";
import { parseDateStr, toDateStr } from "./dates";
import { computeSpanDays } from "./eventSpan";
import { EventRow, EventType, GatheringType, Level, Recurring } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

// Moves a single occurrence to newDate. Never touches new_time/new_end_date —
// the upsert below only ever sends event_id/original_date/new_date, so
// PostgREST's merge-duplicates upsert leaves an existing new_time (set by a
// day-view retime) or new_end_date (set by the resize handle) untouched on
// conflict.
//
// - Non-recurring: updates the event row's event_date directly.
// - Recurring: writes an event_overrides row instead of touching the base
//   event, keyed by originalDate (the natural, anchor-derived date) so
//   dragging the same occurrence again updates this same override row.
//   The row is only deleted when date, time, AND span are all back to
//   natural — dragging the date back while a time or span override still
//   exists must keep the row (just with new_date reset), not destroy those
//   other overrides too.
export async function moveOccurrence(
  event: EventRow,
  originalDate: string,
  newDate: string
): Promise<AffectedRow[]> {
  if (event.recurring === "None") {
    const before = await fetchRow("events", event.id);
    const { data, error } = await supabase
      .from("events")
      .update({ event_date: newDate })
      .eq("id", event.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return [{ table: "events", id: event.id, before, after: data }];
  }

  const { data: existing, error: fetchError } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const hasTimeOverride = existing?.new_time != null;
  const hasSpanOverride = existing?.new_end_date != null;

  if (newDate === originalDate && !hasTimeOverride && !hasSpanOverride) {
    if (existing) {
      const { error } = await supabase.from("event_overrides").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return [{ table: "event_overrides", id: existing.id, before: existing, after: null }];
    }
    return [];
  }

  const { data, error } = await supabase
    .from("event_overrides")
    .upsert(
      { event_id: event.id, original_date: originalDate, new_date: newDate },
      { onConflict: "event_id,original_date" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return [{ table: "event_overrides", id: data.id, before: existing, after: data }];
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
): Promise<AffectedRow[]> {
  if (event.recurring === "None") {
    const before = await fetchRow("events", event.id);
    const { data, error } = await supabase
      .from("events")
      .update({
        event_time: newTime,
        end_time:
          event.duration_minutes != null ? computeEndTime(newTime, event.duration_minutes) : null,
      })
      .eq("id", event.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return [{ table: "events", id: event.id, before, after: data }];
  }

  const { data: existing, error: fetchError } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const dateIsNatural = !existing || existing.new_date === originalDate;
  const spanIsNatural = !existing || existing.new_end_date == null;
  // Compare by minute value, not string equality — event.event_time is
  // stored as "HH:mm:ss" but computed drag times are "HH:mm", so a strict
  // string comparison would never match even when genuinely back to natural.
  const timeIsNatural =
    event.event_time != null && timeStrToMinutes(newTime) === timeStrToMinutes(event.event_time);

  if (timeIsNatural && dateIsNatural && spanIsNatural) {
    if (existing) {
      const { error } = await supabase.from("event_overrides").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return [{ table: "event_overrides", id: existing.id, before: existing, after: null }];
    }
    return [];
  }

  if (existing) {
    const { data, error } = await supabase
      .from("event_overrides")
      .update({ new_time: timeIsNatural ? null : newTime })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return [{ table: "event_overrides", id: existing.id, before: existing, after: data }];
  }

  const { data, error } = await supabase
    .from("event_overrides")
    .insert({
      event_id: event.id,
      original_date: originalDate,
      new_date: originalDate,
      new_time: newTime,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return [{ table: "event_overrides", id: data.id, before: null, after: data }];
}

export interface EventFormValues {
  name: string;
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  level: Level;
  location: string | null;
  recurring: Recurring;
  repeat_until: string | null;
  notes: string | null;
  event_type: EventType;
  pastoral_youth: boolean;
  pastoral_poly: boolean;
  pastoral_uni: boolean;
  pastoral_adults: boolean;
  gathering_type: GatheringType | null;
  series: string | null;
  preacher_name: string | null;
  sermon_title: string | null;
  theme: string | null;
}

export async function createEvent(values: EventFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("events").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "events", id: data.id, before: null, after: data }];
}

export async function updateEvent(id: string, values: EventFormValues): Promise<AffectedRow[]> {
  const before = await fetchRow("events", id);
  const { data, error } = await supabase.from("events").update(values).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "events", id, before, after: data }];
}

// Deletes the base event row. event_overrides/event_exceptions have ON
// DELETE CASCADE on event_id, so any per-occurrence overrides/exceptions for
// this event are cleaned up automatically — captured explicitly below so
// undo can bring the whole series (base row + its overrides/exceptions)
// back, not just the base row. For a recurring event this deletes the whole
// series — the confirmation UI is responsible for making that unambiguous
// before calling this.
export async function deleteEvent(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("events", id);
  const { data: overrides, error: overridesError } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", id);
  if (overridesError) throw new Error(overridesError.message);
  const { data: exceptions, error: exceptionsError } = await supabase
    .from("event_exceptions")
    .select("*")
    .eq("event_id", id);
  if (exceptionsError) throw new Error(exceptionsError.message);

  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const affected: AffectedRow[] = [];
  if (before) affected.push({ table: "events", id, before, after: null });
  for (const row of overrides ?? []) {
    affected.push({ table: "event_overrides", id: row.id, before: row, after: null });
  }
  for (const row of exceptions ?? []) {
    affected.push({ table: "event_exceptions", id: row.id, before: row, after: null });
  }
  return affected;
}

// "Only this event" edit: pulls one occurrence of a recurring series out
// into its own standalone event carrying the edited values, and excepts the
// original date so the series stops generating it. The rest of the series
// (before and after) is untouched.
export async function detachOccurrence(
  event: EventRow,
  originalDate: string,
  values: EventFormValues
): Promise<AffectedRow[]> {
  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert({ ...values, recurring: "None", repeat_until: null })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  const affected: AffectedRow[] = [{ table: "events", id: inserted.id, before: null, after: inserted }];

  const { data: existingException } = await supabase
    .from("event_exceptions")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();

  const { data: exception, error: exceptionError } = await supabase
    .from("event_exceptions")
    .upsert({ event_id: event.id, original_date: originalDate }, { onConflict: "event_id,original_date" })
    .select()
    .single();
  if (exceptionError) throw new Error(exceptionError.message);
  affected.push({ table: "event_exceptions", id: exception.id, before: existingException ?? null, after: exception });

  // Any prior date/time-only override on this occurrence is superseded by
  // the standalone event's own fields — remove it so it doesn't linger.
  const { data: existingOverride } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (existingOverride) {
    const { error: deleteOverrideError } = await supabase
      .from("event_overrides")
      .delete()
      .eq("id", existingOverride.id);
    if (deleteOverrideError) throw new Error(deleteOverrideError.message);
    affected.push({ table: "event_overrides", id: existingOverride.id, before: existingOverride, after: null });
  }

  return affected;
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
): Promise<AffectedRow[]> {
  // Editing the very first occurrence "and all future" has nothing to
  // preserve before it — same as editing the whole series in place.
  if (originalDate === event.event_date) {
    return updateEvent(event.id, values);
  }

  const affected: AffectedRow[] = [];

  const cutoff = toDateStr(subDays(parseDateStr(originalDate), 1));
  const beforeShorten = await fetchRow("events", event.id);
  const { data: shortened, error: shortenError } = await supabase
    .from("events")
    .update({ repeat_until: cutoff })
    .eq("id", event.id)
    .select()
    .single();
  if (shortenError) throw new Error(shortenError.message);
  affected.push({ table: "events", id: event.id, before: beforeShorten, after: shortened });

  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert(values)
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  const newEventId = inserted.id as string;
  affected.push({ table: "events", id: newEventId, before: null, after: inserted });

  const { data: overridesBefore, error: overridesBeforeError } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .gt("original_date", originalDate);
  if (overridesBeforeError) throw new Error(overridesBeforeError.message);
  if (overridesBefore && overridesBefore.length > 0) {
    const { data: overridesAfter, error: overrideMigrateError } = await supabase
      .from("event_overrides")
      .update({ event_id: newEventId })
      .eq("event_id", event.id)
      .gt("original_date", originalDate)
      .select();
    if (overrideMigrateError) throw new Error(overrideMigrateError.message);
    const afterById = new Map((overridesAfter ?? []).map((row) => [row.id, row]));
    for (const row of overridesBefore) {
      affected.push({ table: "event_overrides", id: row.id, before: row, after: afterById.get(row.id) ?? null });
    }
  }

  const { data: overrideOnSplitDate } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (overrideOnSplitDate) {
    const { error: overrideDeleteError } = await supabase
      .from("event_overrides")
      .delete()
      .eq("id", overrideOnSplitDate.id);
    if (overrideDeleteError) throw new Error(overrideDeleteError.message);
    affected.push({ table: "event_overrides", id: overrideOnSplitDate.id, before: overrideOnSplitDate, after: null });
  }

  const { data: exceptionsBefore, error: exceptionsBeforeError } = await supabase
    .from("event_exceptions")
    .select("*")
    .eq("event_id", event.id)
    .gt("original_date", originalDate);
  if (exceptionsBeforeError) throw new Error(exceptionsBeforeError.message);
  if (exceptionsBefore && exceptionsBefore.length > 0) {
    const { data: exceptionsAfter, error: exceptionMigrateError } = await supabase
      .from("event_exceptions")
      .update({ event_id: newEventId })
      .eq("event_id", event.id)
      .gt("original_date", originalDate)
      .select();
    if (exceptionMigrateError) throw new Error(exceptionMigrateError.message);
    const afterById = new Map((exceptionsAfter ?? []).map((row) => [row.id, row]));
    for (const row of exceptionsBefore) {
      affected.push({ table: "event_exceptions", id: row.id, before: row, after: afterById.get(row.id) ?? null });
    }
  }

  return affected;
}

// Drag-to-resize handle: extends/shrinks a single occurrence's span to end
// on newEndDate. Mirrors retimeOccurrence's shape closely (date is never
// touched here — that's moveOccurrence's job), with the natural span end
// computed from the series' template spanDays rather than a stored field.
//
// - Non-recurring: updates the base row's end_date directly (null when
//   back to single-day, matching how a null end_date is always read).
// - Recurring: writes/updates event_overrides.new_end_date, preserving
//   whatever new_date/new_time already exist on that row.
export async function extendOccurrenceSpan(
  event: EventRow,
  originalDate: string,
  newEndDate: string
): Promise<AffectedRow[]> {
  if (event.recurring === "None") {
    const before = await fetchRow("events", event.id);
    const { data, error } = await supabase
      .from("events")
      .update({ end_date: newEndDate === event.event_date ? null : newEndDate })
      .eq("id", event.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return [{ table: "events", id: event.id, before, after: data }];
  }

  const naturalEndDate = toDateStr(addDays(parseDateStr(originalDate), computeSpanDays(event)));

  const { data: existing, error: fetchError } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const dateIsNatural = !existing || existing.new_date === originalDate;
  const timeIsNatural = !existing || existing.new_time == null;
  const spanIsNatural = newEndDate === naturalEndDate;

  if (spanIsNatural && dateIsNatural && timeIsNatural) {
    if (existing) {
      const { error } = await supabase.from("event_overrides").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return [{ table: "event_overrides", id: existing.id, before: existing, after: null }];
    }
    return [];
  }

  if (existing) {
    const { data, error } = await supabase
      .from("event_overrides")
      .update({ new_end_date: spanIsNatural ? null : newEndDate })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return [{ table: "event_overrides", id: existing.id, before: existing, after: data }];
  }

  const { data, error } = await supabase
    .from("event_overrides")
    .insert({
      event_id: event.id,
      original_date: originalDate,
      new_date: originalDate,
      new_end_date: newEndDate,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return [{ table: "event_overrides", id: data.id, before: null, after: data }];
}

// "Only this event" delete: excepts the occurrence so the series stops
// generating it, without touching the series or any other occurrence.
export async function deleteOccurrence(event: EventRow, originalDate: string): Promise<AffectedRow[]> {
  const { data: existingException } = await supabase
    .from("event_exceptions")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();

  const { data: exception, error: exceptionError } = await supabase
    .from("event_exceptions")
    .upsert({ event_id: event.id, original_date: originalDate }, { onConflict: "event_id,original_date" })
    .select()
    .single();
  if (exceptionError) throw new Error(exceptionError.message);
  const affected: AffectedRow[] = [
    { table: "event_exceptions", id: exception.id, before: existingException ?? null, after: exception },
  ];

  const { data: existingOverride } = await supabase
    .from("event_overrides")
    .select("*")
    .eq("event_id", event.id)
    .eq("original_date", originalDate)
    .maybeSingle();
  if (existingOverride) {
    const { error: deleteOverrideError } = await supabase
      .from("event_overrides")
      .delete()
      .eq("id", existingOverride.id);
    if (deleteOverrideError) throw new Error(deleteOverrideError.message);
    affected.push({ table: "event_overrides", id: existingOverride.id, before: existingOverride, after: null });
  }

  return affected;
}
