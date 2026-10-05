"use server";

import { supabase } from "./supabase";
import { ChecklistFormValues, ChecklistStatus } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { pickChecklistColumns } from "./pickColumns";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { insertChecklistRow } from "./rowWrites";
import { logActivity } from "./activity";

async function createChecklistItemImpl(values: ChecklistFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { id, affected } = await insertChecklistRow(values);
  await logActivity({ action: "added", entity: "checklist", entityId: id, label: values.item });
  return affected;
}

// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
async function updateChecklistItemImpl(
  id: string,
  values: ChecklistFormValues,
  expectedUpdatedAt?: string,
  // Bulk callers (Check Calendar) pass quiet and log one summary instead.
  quiet?: boolean
): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("checklist", id);
  let query = supabase.from("checklist").update(pickChecklistColumns(values)).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this checklist item. Check your connection and try again. Your details are still in the form.");
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Checklist item not found."
    );
  }
  if (!quiet) await logActivity({ action: "edited", entity: "checklist", entityId: id, label: values.item });
  return [{ table: "checklist", id, before, after: data[0] }];
}

// Slim update for the inline status dropdown — avoids sending the whole form.
async function updateChecklistStatusImpl(
  id: string,
  status: ChecklistStatus,
  expectedUpdatedAt?: string,
  quiet?: boolean
): Promise<AffectedRow[]> {
  await requireRole("editor");
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
  if (!quiet) await logActivity({ action: "edited", entity: "checklist", entityId: id, label: String(data[0].item) });
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

// One feed entry for a whole "Check Calendar" run, instead of one per item.
async function logCheckCalendarSummaryImpl(count: number): Promise<void> {
  await requireRole("editor");
  const n = Math.max(0, Math.min(999, Math.floor(Number(count) || 0)));
  if (n === 0) return;
  await logActivity({ action: "edited", entity: "checklist", entityId: null, label: `Check Calendar: ${n} item${n === 1 ? "" : "s"} updated` });
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

export async function logCheckCalendarSummary(...args: Parameters<typeof logCheckCalendarSummaryImpl>) {
  return runAction(() => logCheckCalendarSummaryImpl(...args));
}
