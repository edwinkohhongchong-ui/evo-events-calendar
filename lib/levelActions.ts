"use server";

import { supabase } from "./supabase";
import { LevelFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";

export async function createLevel(values: LevelFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase.from("levels").insert(values).select().single();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this category. Please try again.");
  }
  return [{ table: "levels", id: data.id, before: null, after: data }];
}

// Renaming is safe for events already using this level — events_level_fkey
// (migration 006) is ON UPDATE CASCADE, so Postgres updates every matching
// events.level row automatically, and undoing the rename (restoring the old
// `name` here) cascades the same way in reverse.
// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
export async function updateLevel(
  id: string,
  values: LevelFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("viewer");
  const before = await fetchRow("levels", id);
  let query = supabase.from("levels").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this category. Please try again.");
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Category not found."
    );
  }
  return [{ table: "levels", id, before, after: data[0] }];
}

// Fails with a DB error (surfaced to the form) if any event still uses this
// level — events_level_fkey is ON DELETE RESTRICT, deliberately not
// cascading, so deleting a category never silently orphans events.
export async function deleteLevel(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("levels", id);
  const { error } = await supabase.from("levels").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this category. Please try again.");
  }
  return before ? [{ table: "levels", id, before, after: null }] : [];
}
