import { supabase } from "./supabase";
import { SeasonFormValues } from "./types";

export async function createSeason(values: SeasonFormValues): Promise<void> {
  const { error } = await supabase.from("seasons").insert(values);
  if (error) throw new Error(error.message);
}

export async function updateSeason(id: string, values: SeasonFormValues): Promise<void> {
  const { error } = await supabase.from("seasons").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
