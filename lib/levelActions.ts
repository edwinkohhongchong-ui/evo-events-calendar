import { supabase } from "./supabase";
import { LevelFormValues } from "./types";

export async function createLevel(values: LevelFormValues): Promise<void> {
  const { error } = await supabase.from("levels").insert(values);
  if (error) throw new Error(error.message);
}

// Renaming is safe for events already using this level — events_level_fkey
// (migration 006) is ON UPDATE CASCADE, so Postgres updates every matching
// events.level row automatically.
export async function updateLevel(id: string, values: LevelFormValues): Promise<void> {
  const { error } = await supabase.from("levels").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

// Fails with a DB error (surfaced to the form) if any event still uses this
// level — events_level_fkey is ON DELETE RESTRICT, deliberately not
// cascading, so deleting a category never silently orphans events.
export async function deleteLevel(id: string): Promise<void> {
  const { error } = await supabase.from("levels").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
