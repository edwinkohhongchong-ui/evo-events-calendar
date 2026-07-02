import { supabase } from "./supabase";
import { ChecklistFormValues, ChecklistStatus } from "./types";

export async function createChecklistItem(values: ChecklistFormValues): Promise<void> {
  const { error } = await supabase.from("checklist").insert(values);
  if (error) throw new Error(error.message);
}

export async function updateChecklistItem(id: string, values: ChecklistFormValues): Promise<void> {
  const { error } = await supabase.from("checklist").update(values).eq("id", id);
  if (error) throw new Error(error.message);
}

// Slim update for the inline status dropdown — avoids sending the whole form.
export async function updateChecklistStatus(id: string, status: ChecklistStatus): Promise<void> {
  const { error } = await supabase.from("checklist").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from("checklist").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
