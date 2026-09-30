import { supabase } from "../supabase";
import { SnapshotRow, UndoTable } from "./types";

// Full-row fetch used to capture a "before" snapshot ahead of an update or
// delete, so undo has something exact to restore — not just the fields the
// form happened to submit.
export async function fetchRow(table: UndoTable, id: string): Promise<SnapshotRow | null> {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
