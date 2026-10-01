"use server";

import { supabase } from "./supabase";
import { ChecklistFormValues, ChecklistStatus } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";

async function createChecklistItemImpl(values: ChecklistFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase.from("checklist").insert(values).select().single();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this checklist item. Please try again.");
  }
  await logActivity({ action: "added", entity: "checklist", entityId: data.id, label: values.item });
  return [{ table: "checklist", id: data.id, before: null, after: data }];
}

// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
async function updateChecklistItemImpl(
  id: string,
  values: ChecklistFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("viewer");
  const before = await fetchRow("checklist", id);
  let query = supabase.from("checklist").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this checklist item. Please try again.");
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Checklist item not found."
    );
  }
  await logActivity({ action: "edited", entity: "checklist", entityId: id, label: values.item });
  return [{ table: "checklist", id, before, after: data[0] }];
}

// Slim update for the inline status dropdown — avoids sending the whole form.
async function updateChecklistStatusImpl(
  id: string,
  status: ChecklistStatus,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("viewer");
  const before = await fetchRow("checklist", id);
  let query = supabase.from("checklist").update({ status }).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong updating this checklist item's status. Please try again.");
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Checklist item not found."
    );
  }
  await logActivity({ action: "edited", entity: "checklist", entityId: id, label: String(data[0].item) });
  return [{ table: "checklist", id, before, after: data[0] }];
}

async function deleteChecklistItemImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("checklist", id);
  const { error } = await supabase.from("checklist").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this checklist item. Please try again.");
  }
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "checklist", entityId: id, label: String(before.item) });
  return [{ table: "checklist", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createChecklistItem(...args: Parameters<typeof createChecklistItemImpl>) {
  return runAction(() => createChecklistItemImpl(...args));
}

export async function updateChecklistItem(...args: Parameters<typeof updateChecklistItemImpl>) {
  return runAction(() => updateChecklistItemImpl(...args));
}

export async function updateChecklistStatus(...args: Parameters<typeof updateChecklistStatusImpl>) {
  return runAction(() => updateChecklistStatusImpl(...args));
}

export async function deleteChecklistItem(...args: Parameters<typeof deleteChecklistItemImpl>) {
  return runAction(() => deleteChecklistItemImpl(...args));
}
