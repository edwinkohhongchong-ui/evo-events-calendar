import { supabase } from "./supabase";
import { HolidayFormValues } from "./types";

export async function createHoliday(values: HolidayFormValues): Promise<void> {
  const { error } = await supabase.from("holidays").insert(values);
  if (error) throw new Error(error.message);
}

export async function updateHoliday(id: string, values: HolidayFormValues): Promise<void> {
  const { error } = await supabase.from("holidays").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHoliday(id: string): Promise<void> {
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
