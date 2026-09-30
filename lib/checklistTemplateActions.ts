import { supabase } from "./supabase";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

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
export async function saveChecklistTemplate(
  templateId: string | null,
  name: string,
  items: ChecklistTemplateItemInput[]
): Promise<AffectedRow[]> {
  const affected: AffectedRow[] = [];
  let id = templateId;

  if (id) {
    const before = await fetchRow("checklist_templates", id);
    const { data, error } = await supabase
      .from("checklist_templates")
      .update({ name })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    affected.push({ table: "checklist_templates", id, before, after: data });

    const { data: oldItems, error: fetchErr } = await supabase
      .from("checklist_template_items")
      .select("*")
      .eq("template_id", id);
    if (fetchErr) throw new Error(fetchErr.message);
    for (const oldItem of oldItems ?? []) {
      affected.push({ table: "checklist_template_items", id: oldItem.id, before: oldItem, after: null });
    }
    const { error: deleteErr } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("template_id", id);
    if (deleteErr) throw new Error(deleteErr.message);
  } else {
    const { data, error } = await supabase.from("checklist_templates").insert({ name }).select().single();
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    for (const row of inserted ?? []) {
      affected.push({ table: "checklist_template_items", id: row.id, before: null, after: row });
    }
  }

  return affected;
}

export async function deleteChecklistTemplate(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("checklist_templates", id);
  const { data: items } = await supabase.from("checklist_template_items").select("*").eq("template_id", id);
  const affected: AffectedRow[] = (items ?? []).map((item) => ({
    table: "checklist_template_items" as const,
    id: item.id,
    before: item,
    after: null,
  }));

  const { error } = await supabase.from("checklist_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (before) affected.push({ table: "checklist_templates", id, before, after: null });
  return affected;
}

// Applies a saved template to one event — expands each item by its
// repeat_count into that many `checklist` rows (numbered "— Week N of M"
// when repeated), all linked to the event so they show up everywhere a
// linked checklist item already does (Checklist tab, Reminders picker).
export async function applyChecklistTemplate(eventId: string, templateId: string): Promise<AffectedRow[]> {
  const { data: items, error } = await supabase
    .from("checklist_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw new Error(error.message);

  const rows: Record<string, unknown>[] = [];
  for (const templateItem of items ?? []) {
    const count = templateItem.repeat_count ?? 1;
    for (let i = 1; i <= count; i++) {
      rows.push({
        category: "Event Prep",
        item: count > 1 ? `${templateItem.item} — Week ${i} of ${count}` : templateItem.item,
        status: "Not Started",
        target_month: null,
        notes: null,
        linked_event_id: eventId,
      });
    }
  }
  if (rows.length === 0) return [];

  const { data: inserted, error: insertErr } = await supabase.from("checklist").insert(rows).select();
  if (insertErr) throw new Error(insertErr.message);
  return (inserted ?? []).map((row) => ({ table: "checklist" as const, id: row.id, before: null, after: row }));
}
