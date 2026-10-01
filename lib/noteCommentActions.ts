"use server";

import { supabase } from "./supabase";
import { NoteScope } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { MAX_YEAR, MIN_YEAR } from "./dates";

export interface NoteCommentValues {
  scope: NoteScope;
  year: number | null;
  month: number | null;
  author_name: string;
  content: string;
  // Set only when this comment is a reply to a top-level comment.
  parent_id?: string | null;
}

// Month notes belong to a specific month; general notes to no month at all.
function noteLogTarget(scope: string, year: number | null, month: number | null) {
  return {
    label: scope === "month" ? "Month Notes" : "General Notes",
    itemDate: scope === "month" && year && month ? `${year}-${String(month).padStart(2, "0")}-01` : null,
  };
}

const MAX_COMMENT_LENGTH = 2000;
const MAX_AUTHOR_LENGTH = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateNoteComment(v: NoteCommentValues) {
  if (v.scope !== "general" && v.scope !== "month") throw new Error("Unknown note type.");
  if (v.scope === "month") {
    const ok =
      Number.isInteger(v.year) && v.year! >= MIN_YEAR && v.year! <= MAX_YEAR &&
      Number.isInteger(v.month) && v.month! >= 1 && v.month! <= 12;
    if (!ok) throw new Error("That month isn't valid.");
  }
  if (typeof v.content !== "string" || v.content.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comments can be at most ${MAX_COMMENT_LENGTH} characters.`);
  }
  if (typeof v.author_name !== "string" || v.author_name.length > MAX_AUTHOR_LENGTH) {
    throw new Error(`Names can be at most ${MAX_AUTHOR_LENGTH} characters.`);
  }
  if (v.parent_id != null && (typeof v.parent_id !== "string" || !UUID_RE.test(v.parent_id))) {
    throw new Error("Couldn't find the comment you're replying to.");
  }
}

async function createNoteCommentImpl(values: NoteCommentValues): Promise<AffectedRow[]> {
  await requireRole("viewer");
  validateNoteComment(values);
  const { data, error } = await supabase.from("note_comments").insert(values).select().single();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong posting this comment. Please try again.");
  }
  await logActivity({
    action: "commented",
    entity: values.parent_id ? "comment" : "note",
    entityId: data.id,
    ...noteLogTarget(values.scope, values.year, values.month),
  });
  return [{ table: "note_comments", id: data.id, before: null, after: data }];
}

// Removing a top-level comment also removes its replies (ON DELETE CASCADE,
// migration 012) — captured explicitly here so undo can bring them all back,
// not just the parent.
async function deleteNoteCommentImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("note_comments", id);
  if (!before) return [];
  const { data: replies, error: repliesError } = await supabase
    .from("note_comments")
    .select("*")
    .eq("parent_id", id);
  if (repliesError) {
    console.error(repliesError);
    throw new Error("Something went wrong deleting this comment. Please try again.");
  }

  const { error } = await supabase.from("note_comments").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this comment. Please try again.");
  }

  const affected: AffectedRow[] = [{ table: "note_comments", id, before, after: null }];
  for (const reply of replies ?? []) {
    affected.push({ table: "note_comments", id: reply.id, before: reply, after: null });
  }
  await logActivity({
    action: "deleted",
    entity: before.parent_id ? "comment" : "note",
    entityId: id,
    ...noteLogTarget(before.scope, before.year, before.month),
  });
  return affected;
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createNoteComment(...args: Parameters<typeof createNoteCommentImpl>) {
  return runAction(() => createNoteCommentImpl(...args));
}

export async function deleteNoteComment(...args: Parameters<typeof deleteNoteCommentImpl>) {
  return runAction(() => deleteNoteCommentImpl(...args));
}
