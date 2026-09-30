import { supabase } from "./supabase";
import { SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export async function createSeason(values: SeasonFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("seasons").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "seasons", id: data.id, before: null, after: data }];
}

export async function updateSeason(id: string, values: SeasonFormValues): Promise<AffectedRow[]> {
  const before = await fetchRow("seasons", id);
  const { data, error } = await supabase.from("seasons").update(values).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "seasons", id, before, after: data }];
}

export async function deleteSeason(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("seasons", id);
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "seasons", id, before, after: null }] : [];
}
