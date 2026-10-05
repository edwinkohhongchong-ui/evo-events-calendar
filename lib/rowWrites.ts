import { supabase } from "./supabase";
import type { EventFormValues } from "./actions";
import { ChecklistFormValues, HolidayFormValues, SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { pickChecklistColumns, pickEventColumns, pickHolidayColumns } from "./pickColumns";
import { EVENT_CONFLICT_MESSAGE } from "./eventConflict";
import { OWNER_MIGRATION_HINT, isMissingOwnerColumn, withOwner } from "./owner";
import { RowConflictError } from "./rowConflict";
import { CUSTOM_COLOR_MIGRATION_MESSAGE, isHexColor } from "./colorStyle";

// The database half of createSeason/updateSeason/createHoliday/updateHoliday,
// createEvent/updateEvent and createChecklistItem/updateChecklistItem,
// shared with the schedule import so both write through exactly the same
// column allow-lists, error messages and AffectedRow capture (what Undo
// replays). Not a "use server" file, so none of this is client-callable:
// callers must call requireRole() themselves and do their own activity logging.

// Before migration 026 the DB check constraint rejects hex colours (23514).
function seasonSaveError(code: string | undefined, values: SeasonFormValues): Error {
  if (code === "23514" && isHexColor(values.color)) {
    console.error("Custom colour rejected by check constraint: run migration 026.");
    return new Error(CUSTOM_COLOR_MIGRATION_MESSAGE);
  }
  return new Error("Something went wrong saving this season. Check your connection and try again. Your details are still in the form.");
}

const HOLIDAY_SAVE_ERROR = "Something went wrong saving this holiday. Check your connection and try again. Your details are still in the form.";

export async function insertSeasonRow(values: SeasonFormValues): Promise<{ id: string; affected: AffectedRow[] }> {
  const { data, error } = await supabase.from("seasons").insert(values).select().single();
  if (error) {
    console.error(error);
    throw seasonSaveError(error.code, values);
  }
  return { id: data.id, affected: [{ table: "seasons", id: data.id, before: null, after: data }] };
}

export async function updateSeasonRow(
  id: string,
  values: SeasonFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  const before = await fetchRow("seasons", id);
  let query = supabase.from("seasons").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw seasonSaveError(error.code, values);
  }
  if (!data || data.length === 0) {
    throw expectedUpdatedAt ? new RowConflictError() : new Error("Season not found.");
  }
  return [{ table: "seasons", id, before, after: data[0] }];
}

export async function insertHolidayRow(values: HolidayFormValues): Promise<{ id: string; affected: AffectedRow[] }> {
  const { data, error } = await supabase.from("holidays").insert(pickHolidayColumns(values)).select().single();
  if (error) {
    console.error(error);
    throw new Error(HOLIDAY_SAVE_ERROR);
  }
  return { id: data.id, affected: [{ table: "holidays", id: data.id, before: null, after: data }] };
}

export async function updateHolidayRow(
  id: string,
  values: HolidayFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  const before = await fetchRow("holidays", id);
  let query = supabase.from("holidays").update(pickHolidayColumns(values)).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error(HOLIDAY_SAVE_ERROR);
  }
  if (!data || data.length === 0) {
    throw expectedUpdatedAt ? new RowConflictError() : new Error("Holiday not found.");
  }
  return [{ table: "holidays", id, before, after: data[0] }];
}

const EVENT_SAVE_ERROR = "Something went wrong saving this event. Check your connection and try again. Your details are still in the form.";
const EVENT_CATEGORY_GONE = "That event type's category doesn't exist any more. Add it under Categories, then try again.";

export async function insertEventRow(values: EventFormValues): Promise<{ id: string; affected: AffectedRow[] }> {
  const row = withOwner(pickEventColumns(values));
  const { data, error } = await supabase.from("events").insert(row).select().single();
  if (error) {
    console.error(error);
    if ("owner" in row && isMissingOwnerColumn(error)) throw new Error(OWNER_MIGRATION_HINT);
    if (error.code === "23503") throw new Error(EVENT_CATEGORY_GONE);
    throw new Error(EVENT_SAVE_ERROR);
  }
  // Undo deletes the event (its checklist cascades away); redo recreates the
  // event row only, so any checklist added after creation is not restored.
  return { id: data.id, affected: [{ table: "events", id: data.id, before: null, after: data }] };
}

/**
 * `preserveOwner` is for partial patches (the Excel import): by default an
 * update with no owner clears the column, which a patch must not do.
 */
export async function updateEventRow(
  id: string,
  values: EventFormValues,
  expectedUpdatedAt?: string,
  opts: { preserveOwner?: boolean } = {}
): Promise<AffectedRow[]> {
  const before = await fetchRow("events", id);
  // `before` has an owner key only once migration 025 exists, which is also
  // the only time sending owner: null (to clear it) is safe.
  const row = withOwner(pickEventColumns(values), !opts.preserveOwner && !!before && "owner" in before);
  let query = supabase.from("events").update(row).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    if ("owner" in row && isMissingOwnerColumn(error)) throw new Error(OWNER_MIGRATION_HINT);
    if (error.code === "23503") throw new Error(EVENT_CATEGORY_GONE);
    throw new Error(EVENT_SAVE_ERROR);
  }
  if (!data || data.length === 0) {
    // The row still exists, so the zero-row match was the updated_at guard.
    throw new Error(expectedUpdatedAt && before ? EVENT_CONFLICT_MESSAGE : "Event not found.");
  }
  return [{ table: "events", id, before, after: data[0] }];
}

const CHECKLIST_SAVE_ERROR = "Something went wrong saving this checklist item. Check your connection and try again. Your details are still in the form.";

export async function insertChecklistRow(values: ChecklistFormValues): Promise<{ id: string; affected: AffectedRow[] }> {
  const { data, error } = await supabase.from("checklist").insert(pickChecklistColumns(values)).select().single();
  if (error) {
    console.error(error);
    throw new Error(CHECKLIST_SAVE_ERROR);
  }
  return { id: data.id, affected: [{ table: "checklist", id: data.id, before: null, after: data }] };
}

export async function updateChecklistRow(
  id: string,
  values: ChecklistFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  const before = await fetchRow("checklist", id);
  let query = supabase.from("checklist").update(pickChecklistColumns(values)).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error(CHECKLIST_SAVE_ERROR);
  }
  if (!data || data.length === 0) {
    throw expectedUpdatedAt ? new RowConflictError() : new Error("Checklist item not found.");
  }
  return [{ table: "checklist", id, before, after: data[0] }];
}

// Reads the Excel import's Apply needs to validate against (one query each).
export async function fetchLevelNames(): Promise<string[]> {
  const { data, error } = await supabase.from("levels").select("name");
  if (error) {
    console.error(error);
    throw new Error("Something went wrong checking the levels. Please try again.");
  }
  return (data ?? []).map((r: { name: string }) => r.name);
}

/** event id (lower case) -> recurring, for the events that exist. */
export async function fetchEventRecurring(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from("events").select("id, recurring").in("id", ids);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong checking the events. Please try again.");
  }
  for (const r of data ?? []) out.set(String(r.id).toLowerCase(), String(r.recurring));
  return out;
}
