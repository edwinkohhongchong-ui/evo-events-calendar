"use server";

import { supabase } from "./supabase";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";

async function createDayNoteImpl(noteDate: string, content: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase
    .from("day_notes")
    .insert({ note_date: noteDate, content })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity({ action: "added", entity: "day_note", entityId: data.id, label: content, itemDate: noteDate });
  return [{ table: "day_notes", id: data.id, before: null, after: data }];
}

async function deleteDayNoteImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("day_notes", id);
  const { error } = await supabase.from("day_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "day_note", entityId: id, label: String(before.content), itemDate: before.note_date });
  return [{ table: "day_notes", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createDayNote(...args: Parameters<typeof createDayNoteImpl>) {
  return runAction(() => createDayNoteImpl(...args));
}

export async function deleteDayNote(...args: Parameters<typeof deleteDayNoteImpl>) {
  return runAction(() => deleteDayNoteImpl(...args));
}
