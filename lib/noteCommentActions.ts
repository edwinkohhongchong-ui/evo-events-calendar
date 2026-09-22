import { supabase } from "./supabase";
import { NoteScope } from "./types";

export interface NoteCommentValues {
  scope: NoteScope;
  year: number | null;
  month: number | null;
  author_name: string;
  content: string;
  // Set only when this comment is a reply to a top-level comment.
  parent_id?: string | null;
}

export async function createNoteComment(values: NoteCommentValues): Promise<void> {
  const { error } = await supabase.from("note_comments").insert(values);
  if (error) throw new Error(error.message);
}

// Removing a top-level comment also removes its replies (ON DELETE CASCADE,
// migration 012) — no orphaned replies left behind.
export async function deleteNoteComment(id: string): Promise<void> {
  const { error } = await supabase.from("note_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
