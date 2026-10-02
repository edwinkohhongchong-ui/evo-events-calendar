import { supabase } from "./supabase";
import { HolidayFormValues, SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { pickHolidayColumns } from "./pickColumns";
import { RowConflictError } from "./rowConflict";
import { CUSTOM_COLOR_MIGRATION_MESSAGE, isHexColor } from "./colorStyle";

// The database half of createSeason/updateSeason/createHoliday/updateHoliday,
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
