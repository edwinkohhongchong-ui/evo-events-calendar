import { supabase } from "./supabase";
import { ReminderTemplateFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export async function createReminderTemplate(values: ReminderTemplateFormValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("reminder_templates").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "reminder_templates", id: data.id, before: null, after: data }];
}

export async function updateReminderTemplate(
  id: string,
  values: ReminderTemplateFormValues
): Promise<AffectedRow[]> {
  const before = await fetchRow("reminder_templates", id);
  const { data, error } = await supabase
    .from("reminder_templates")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return [{ table: "reminder_templates", id, before, after: data }];
}

export async function deleteReminderTemplate(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("reminder_templates", id);
  const { error } = await supabase.from("reminder_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "reminder_templates", id, before, after: null }] : [];
}
