"use server";

import { supabase } from "./supabase";
import { LevelFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { CUSTOM_COLOR_MIGRATION_MESSAGE, isHexColor, normaliseColor } from "./colorStyle";

// Accepts a named palette key or "#rrggbb"; stores hex lowercased.
function checkedLevelValues(values: LevelFormValues): LevelFormValues {
  const color_key = normaliseColor(values.color_key);
  if (!color_key) throw new Error("Pick a valid colour.");
  return { ...values, color_key };
}

// Before migration 026 the DB check constraint rejects hex colours (23514).
function saveError(code: string | undefined, values: LevelFormValues): Error {
  if (code === "23514" && isHexColor(values.color_key)) return new Error(CUSTOM_COLOR_MIGRATION_MESSAGE);
  return new Error("Something went wrong saving this category. Please try again.");
}

async function createLevelImpl(input: LevelFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const values = checkedLevelValues(input);
  const { data, error } = await supabase.from("levels").insert(values).select().single();
  if (error) {
    console.error(error);
    throw saveError(error.code, values);
  }
  await logActivity({ action: "added", entity: "category", entityId: data.id, label: values.name, itemDate: null });
  return [{ table: "levels", id: data.id, before: null, after: data }];
}

// Renaming is safe for events already using this level — events_level_fkey
// (migration 006) is ON UPDATE CASCADE, so Postgres updates every matching
// events.level row automatically, and undoing the rename (restoring the old
// `name` here) cascades the same way in reverse.
// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
async function updateLevelImpl(
  id: string,
  input: LevelFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("editor");
  const values = checkedLevelValues(input);
  const before = await fetchRow("levels", id);
  let query = supabase.from("levels").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw saveError(error.code, values);
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Category not found."
    );
  }
  await logActivity({ action: "edited", entity: "category", entityId: id, label: values.name, itemDate: null });
  return [{ table: "levels", id, before, after: data[0] }];
}

// Fails with a DB error (surfaced to the form) if any event still uses this
// level — events_level_fkey is ON DELETE RESTRICT, deliberately not
// cascading, so deleting a category never silently orphans events.
async function deleteLevelImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("levels", id);
  const { error } = await supabase.from("levels").delete().eq("id", id);
  if (error) {
    console.error(error);
    if (error.code === "23503") {
      throw new Error("Can't delete this category — it's still used by one or more events. Reassign those events first.");
    }
    throw new Error("Something went wrong deleting this category. Please try again.");
  }
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "category", entityId: id, label: String(before.name), itemDate: null });
  return [{ table: "levels", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createLevel(...args: Parameters<typeof createLevelImpl>) {
  return runAction(() => createLevelImpl(...args));
}

export async function updateLevel(...args: Parameters<typeof updateLevelImpl>) {
  return runAction(() => updateLevelImpl(...args));
}

export async function deleteLevel(...args: Parameters<typeof deleteLevelImpl>) {
  return runAction(() => deleteLevelImpl(...args));
}
