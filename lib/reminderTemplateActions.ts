"use server";

import { supabase } from "./supabase";
import { ReminderTemplateFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";

export async function createReminderTemplate(values: ReminderTemplateFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase.from("reminder_templates").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "reminder_templates", id: data.id, before: null, after: data }];
}

// See updateHoliday in lib/holidayActions.ts for the full explanation of the
// optional `expectedUpdatedAt` optimistic-lock parameter and the known
// limitation that no call site wires it through yet.
export async function updateReminderTemplate(
  id: string,
  values: ReminderTemplateFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("viewer");
  const before = await fetchRow("reminder_templates", id);
  let query = supabase.from("reminder_templates").update(values).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Reminder template not found."
    );
  }
  return [{ table: "reminder_templates", id, before, after: data[0] }];
}

export async function deleteReminderTemplate(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("reminder_templates", id);
  const { error } = await supabase.from("reminder_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return before ? [{ table: "reminder_templates", id, before, after: null }] : [];
}
