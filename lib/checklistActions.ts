import { supabase } from "./supabase";
import { ChecklistFormValues, ChecklistStatus } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export async function createChecklistItem(values: ChecklistFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("checklist").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "checklist", id: data.id, before: null, after: data }];
}

export async function updateChecklistItem(id: string, values: ChecklistFormValues): Promise<AffectedRow[]> {
  const before = await fetchRow("checklist", id);
  const { data, error } = await supabase.from("checklist").update(values).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "checklist", id, before, after: data }];
}

// Slim update for the inline status dropdown — avoids sending the whole form.
export async function updateChecklistStatus(id: string, status: ChecklistStatus): Promise<AffectedRow[]> {
  const before = await fetchRow("checklist", id);
  const { data, error } = await supabase.from("checklist").update({ status }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "checklist", id, before, after: data }];
}

export async function deleteChecklistItem(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("checklist", id);
  const { error } = await supabase.from("checklist").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "checklist", id, before, after: null }] : [];
}
