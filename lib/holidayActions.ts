import { supabase } from "./supabase";
import { HolidayFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export async function createHoliday(values: HolidayFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("holidays").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "holidays", id: data.id, before: null, after: data }];
}

export async function updateHoliday(id: string, values: HolidayFormValues): Promise<AffectedRow[]> {
  const before = await fetchRow("holidays", id);
  const { data, error } = await supabase.from("holidays").update(values).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "holidays", id, before, after: data }];
}

export async function deleteHoliday(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("holidays", id);
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "holidays", id, before, after: null }] : [];
}
