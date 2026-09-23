import { supabase } from "./supabase";
import { NoteScope } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";

export interface NoteCommentValues {
  scope: NoteScope;
  year: number | null;
  month: number | null;
  author_name: string;
  content: string;
  // Set only when this comment is a reply to a top-level comment.
  parent_id?: string | null;
}

export async function createNoteComment(values: NoteCommentValues): Promise<AffectedRow[]> {
  const { data, error } = await supabase.from("note_comments").insert(values).select().single();
  if (error) throw new Error(error.message);
  return [{ table: "note_comments", id: data.id, before: null, after: data }];
}

// Removing a top-level comment also removes its replies (ON DELETE CASCADE,
// migration 012) — captured explicitly here so undo can bring them all back,
// not just the parent.
export async function deleteNoteComment(id: string): Promise<AffectedRow[]> {
  const before = await fetchRow("note_comments", id);
  if (!before) return [];
  const { data: replies, error: repliesError } = await supabase
    .from("note_comments")
    .select("*")
    .eq("parent_id", id);
  if (repliesError) throw new Error(repliesError.message);

  const { error } = await supabase.from("note_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const affected: AffectedRow[] = [{ table: "note_comments", id, before, after: null }];
  for (const reply of replies ?? []) {
    affected.push({ table: "note_comments", id: reply.id, before: reply, after: null });
  }
  return affected;
}
