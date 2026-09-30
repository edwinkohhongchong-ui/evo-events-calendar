import { supabase } from "./supabase";
import { LevelFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export async function createLevel(values: LevelFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("levels").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "levels", id: data.id, before: null, after: data }];
}

// Renaming is safe for events already using this level — events_level_fkey
// (migration 006) is ON UPDATE CASCADE, so Postgres updates every matching
// events.level row automatically, and undoing the rename (restoring the old
// `name` here) cascades the same way in reverse.
export async function updateLevel(id: string, values: LevelFormValues): Promise<AffectedRow[]> {
  const before = await fetchRow("levels", id);
  const { data, error } = await supabase.from("levels").update(values).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "levels", id, before, after: data }];
}

// Fails with a DB error (surfaced to the form) if any event still uses this
// level — events_level_fkey is ON DELETE RESTRICT, deliberately not
// cascading, so deleting a category never silently orphans events.
export async function deleteLevel(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("levels", id);
  const { error } = await supabase.from("levels").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "levels", id, before, after: null }] : [];
}
