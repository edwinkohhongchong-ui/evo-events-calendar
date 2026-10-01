"use server";

import { supabase } from "./supabase";
import { SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { logActivity } from "./activity";

export async function createSeason(values: SeasonFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase.from("seasons").insert(values).select().single();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this season. Please try again.");
  }
  await logActivity({ action: "added", entity: "season", entityId: data.id, label: values.name, itemDate: values.start_date });
  return [{ table: "seasons", id: data.id, before: null, after: data }];
}

// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
export async function updateSeason(
  id: string,
  values: SeasonFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("viewer");
  const before = await fetchRow("seasons", id);
  let query = supabase.from("seasons").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this season. Please try again.");
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

export async function deleteSeason(id: string): Promise<AffectedRow[]> {
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
