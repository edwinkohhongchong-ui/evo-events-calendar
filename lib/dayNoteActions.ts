import { supabase } from "./supabase";

export async function createDayNote(noteDate: string, content: string): Promise<void> {
  const { error } = await supabase.from("day_notes").insert({ note_date: noteDate, content });
  if (error) throw new Error(error.message);
}

export async function deleteDayNote(id: string): Promise<void> {
  const { error } = await supabase.from("day_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
