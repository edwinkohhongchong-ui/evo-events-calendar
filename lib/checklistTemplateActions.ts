"use server";

import { supabase } from "./supabase";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";

export interface ChecklistTemplateItemInput {
  item: string;
  repeat_count: number;
}

// Creates a template, or fully replaces an existing one's name + item list
// in one step. Items are simple ordered config rows with no independent
// identity worth preserving across an edit, so a save always deletes the
// old set and inserts the new one rather than diffing row-by-row — far
// simpler than reconciling added/removed/reordered rows, and the whole
// replacement is captured as one undo step either way.
// `expectedUpdatedAt` (optional, backward-compatible) is an optimistic-lock
// check applied to the rename step when replacing an existing template — see
// updateHoliday in lib/holidayActions.ts for the full explanation and the
// known limitation that no call site wires it through yet. It's ignored when
// templateId is null (there's nothing existing to conflict with on create).
async function saveChecklistTemplateImpl(
  templateId: string | null,
  name: string,
  items: ChecklistTemplateItemInput[],
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  // Creating a brand-new template (templateId == null) is a create action
  // (Editor-only); replacing an existing template's name/items in place is
  // an edit of something that already exists (Viewer-allowed), matching the
  // product decision that Viewers can edit existing rows but not add new
  // top-level ones.
  await requireRole(templateId ? "viewer" : "editor");
  const affected: AffectedRow[] = [];
  let id = templateId;

  if (id) {
    const before = await fetchRow("checklist_templates", id);
    let query = supabase.from("checklist_templates").update({ name }).eq("id", id);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    const { data, error } = await query.select();
    if (error) {
      console.error(error);
      throw new Error("Something went wrong saving this checklist template. Please try again.");
    }
    if (!data || data.length === 0) {
      throw new Error(
        expectedUpdatedAt
          ? "Someone else changed this since you loaded it — please refresh and try again."
          : "Checklist template not found."
      );
    }
    affected.push({ table: "checklist_templates", id, before, after: data[0] });

    const { data: oldItems, error: fetchErr } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", id);
    if (fetchErr) {
      console.error(fetchErr);
      throw new Error("Something went wrong saving this checklist template. Please try again.");
    }
    for (const oldItem of oldItems ?? []) {
      affected.push({ table: "checklist_template_items", id: oldItem.id, before: oldItem, after: null });
    }
    const { error: deleteErr } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("template_id", id);
    if (deleteErr) {
      console.error(deleteErr);
      throw new Error("Something went wrong saving this checklist template. Please try again.");
    }
  } else {
    const { data, error } = await supabase.from("checklist_templates").insert({ name }).select().single();
    if (error) {
      console.error(error);
      throw new Error("Something went wrong saving this checklist template. Please try again.");
    }
    id = data.id as string;
    affected.push({ table: "checklist_templates", id: data.id, before: null, after: data });
  }

  if (items.length > 0) {
    const rows = items.map((item, index) => ({
      template_id: id,
      item: item.item,
      repeat_count: item.repeat_count,
      sort_order: index,
    }));
    const { data: inserted, error } = await supabase.from("checklist_template_items").insert(rows).select();
    if (error) {
      console.error(error);
      throw new Error("Something went wrong saving this checklist template's items. Please try again.");
    }
    for (const row of inserted ?? []) {
      affected.push({ table: "checklist_template_items", id: row.id, before: null, after: row });
    }
  }

  return affected;
}

async function deleteChecklistTemplateImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("checklist_templates", id);
  const { data: items } = await supabase.from("checklist_template_items").select("*").eq("template_id", id);
  const affected: AffectedRow[] = (items ?? []).map((item) => ({
    table: "checklist_template_items" as const,
    id: item.id,
    before: item,
    after: null,
  }));

  const { error } = await supabase.from("checklist_templates").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this checklist template. Please try again.");
  }
  if (before) affected.push({ table: "checklist_templates", id, before, after: null });
  return affected;
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function saveChecklistTemplate(...args: Parameters<typeof saveChecklistTemplateImpl>) {
  return runAction(() => saveChecklistTemplateImpl(...args));
}

export async function deleteChecklistTemplate(...args: Parameters<typeof deleteChecklistTemplateImpl>) {
  return runAction(() => deleteChecklistTemplateImpl(...args));
}
