"use server";

import { supabase } from "./supabase";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { isValidDateStr } from "./dates";
import { DAY_NOTE_DETAILS_MIGRATION_HINT, isMissingDetailsColumn, normaliseNoteDetails } from "./dayNoteDetails";

const MAX_NOTE_LENGTH = 2000;

async function createDayNoteImpl(noteDate: string, content: string, details?: string | null): Promise<AffectedRow[]> {
  await requireRole("editor");
  if (!isValidDateStr(noteDate)) throw new Error("That date isn't valid.");
  if (typeof content !== "string" || content.length > MAX_NOTE_LENGTH) {
    throw new Error(`Notes can be at most ${MAX_NOTE_LENGTH} characters.`);
  }
  const parsedDetails = normaliseNoteDetails(details);
  // Only sent when present, so plain notes keep saving before migration 027.
  const row: { note_date: string; content: string; details?: string } = { note_date: noteDate, content };
  if (parsedDetails) row.details = parsedDetails;
  const { data, error } = await supabase.from("day_notes").insert(row).select().single();
  if (error) {
    if (parsedDetails && isMissingDetailsColumn(error)) throw new Error(DAY_NOTE_DETAILS_MIGRATION_HINT);
    console.error(error);
    throw new Error("Something went wrong saving this note. Please try again.");
  }
  await logActivity({ action: "added", entity: "day_note", entityId: data.id, label: content, itemDate: noteDate });
  return [{ table: "day_notes", id: data.id, before: null, after: data }];
}

// `details` undefined = leave it as is.
async function updateDayNoteImpl(id: string, content: string, details?: string | null): Promise<AffectedRow[]> {
  await requireRole("editor");
  if (typeof content !== "string" || !content.trim()) throw new Error("A note can't be empty. Use Remove note to delete it.");
  if (content.length > MAX_NOTE_LENGTH) {
    throw new Error(`Notes can be at most ${MAX_NOTE_LENGTH} characters.`);
  }
  const parsedDetails = details === undefined ? undefined : normaliseNoteDetails(details);
  const before = await fetchRow("day_notes", id);
  if (!before) throw new Error("That note no longer exists.");
  const patch: { content: string; details?: string | null } = { content: content.trim() };
  // A clear (null) is only sent when the row actually has details to clear,
  // so title-only edits keep working before migration 027.
  if (parsedDetails !== undefined && (parsedDetails !== null || before.details != null)) {
    patch.details = parsedDetails;
  }
  const { data, error } = await supabase.from("day_notes").update(patch).eq("id", id).select().single();
  if (error) {
    if ("details" in patch && isMissingDetailsColumn(error)) throw new Error(DAY_NOTE_DETAILS_MIGRATION_HINT);
    console.error(error);
    throw new Error("Something went wrong saving this note. Please try again.");
  }
  await logActivity({ action: "edited", entity: "day_note", entityId: id, label: data.content, itemDate: data.note_date });
  return [{ table: "day_notes", id, before, after: data }];
}

async function deleteDayNoteImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("day_notes", id);
  const { error } = await supabase.from("day_notes").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this note. Please try again.");
  }
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "day_note", entityId: id, label: String(before.content), itemDate: before.note_date });
  return [{ table: "day_notes", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createDayNote(...args: Parameters<typeof createDayNoteImpl>) {
  return runAction(() => createDayNoteImpl(...args));
}

export async function updateDayNote(...args: Parameters<typeof updateDayNoteImpl>) {
  return runAction(() => updateDayNoteImpl(...args));
}

export async function deleteDayNote(...args: Parameters<typeof deleteDayNoteImpl>) {
  return runAction(() => deleteDayNoteImpl(...args));
}
