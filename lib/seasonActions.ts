"use server";

import { supabase } from "./supabase";
import { SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { CUSTOM_COLOR_MIGRATION_MESSAGE, isHexColor, normaliseColor } from "./colorStyle";

// Accepts a named palette key, "#rrggbb" or null (auto colour); hex is lowercased.
function checkedSeasonValues(values: SeasonFormValues): SeasonFormValues {
  if (values.color == null) return { ...values, color: null };
  const color = normaliseColor(values.color);
  if (!color) throw new Error("Pick a valid colour.");
  return { ...values, color };
}

// Before migration 026 the DB check constraint rejects hex colours (23514).
function saveError(code: string | undefined, values: SeasonFormValues): Error {
  if (code === "23514" && isHexColor(values.color)) return new Error(CUSTOM_COLOR_MIGRATION_MESSAGE);
  return new Error("Something went wrong saving this season. Please try again.");
}

async function createSeasonImpl(input: SeasonFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const values = checkedSeasonValues(input);
  const { data, error } = await supabase.from("seasons").insert(values).select().single();
  if (error) {
    console.error(error);
    throw saveError(error.code, values);
  }
  await logActivity({ action: "added", entity: "season", entityId: data.id, label: values.name, itemDate: values.start_date });
  return [{ table: "seasons", id: data.id, before: null, after: data }];
}

// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
async function updateSeasonImpl(
  id: string,
  input: SeasonFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("editor");
  const values = checkedSeasonValues(input);
  const before = await fetchRow("seasons", id);
  let query = supabase.from("seasons").update(values).eq("id", id);
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
        : "Season not found."
    );
  }
  await logActivity({ action: "edited", entity: "season", entityId: id, label: values.name, itemDate: values.start_date });
  return [{ table: "seasons", id, before, after: data[0] }];
}

async function deleteSeasonImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("seasons", id);
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this season. Please try again.");
  }
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "season", entityId: id, label: String(before.name), itemDate: before.start_date });
  return [{ table: "seasons", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createSeason(...args: Parameters<typeof createSeasonImpl>) {
  return runAction(() => createSeasonImpl(...args));
}

export async function updateSeason(...args: Parameters<typeof updateSeasonImpl>) {
  return runAction(() => updateSeasonImpl(...args));
}

export async function deleteSeason(...args: Parameters<typeof deleteSeasonImpl>) {
  return runAction(() => deleteSeasonImpl(...args));
}
