import { supabase } from "./supabase";
import { NoteScope } from "./types";

export interface NoteCommentValues {
  scope: NoteScope;
  year: number | null;
  month: number | null;
  author_name: string;
  content: string;
}

// Append-only — there's no update/delete, matching the "who said what and
// when" log design (see migration 011).
export async function createNoteComment(values: NoteCommentValues): Promise<void> {
  const { error } = await supabase.from("note_comments").insert(values);
  if (error) throw new Error(error.message);
}
