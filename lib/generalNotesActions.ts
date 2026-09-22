import { supabase } from "./supabase";

// The singleton row always exists (seeded by migration 009), so this is a
// plain update, not an upsert.
export async function updateGeneralNotes(content: string | null): Promise<void> {
  const { error } = await supabase
    .from("general_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", "singleton");
  if (error) throw new Error(error.message);
}
