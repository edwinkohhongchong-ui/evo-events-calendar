"use server";

import { supabase } from "./supabase";
import { SeasonFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { pickSeasonColumns } from "./pickColumns";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { normaliseColor } from "./colorStyle";
import { insertSeasonRow, updateSeasonRow } from "./rowWrites";

// Accepts a named palette key, "#rrggbb" or null (auto colour); hex is lowercased.
function checkedSeasonValues(values: SeasonFormValues): SeasonFormValues {
  const picked = pickSeasonColumns(values);
  if (values.color == null) return { ...picked, color: null };
  const color = normaliseColor(values.color);
  if (!color) throw new Error("Pick a valid colour.");
  return { ...picked, color };
}

async function createSeasonImpl(input: SeasonFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const values = checkedSeasonValues(input);
  const { id, affected } = await insertSeasonRow(values);
  await logActivity({ action: "added", entity: "season", entityId: id, label: values.name, itemDate: values.start_date });
  return affected;
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
  const affected = await updateSeasonRow(id, values, expectedUpdatedAt);
  await logActivity({ action: "edited", entity: "season", entityId: id, label: values.name, itemDate: values.start_date });
  return affected;
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
