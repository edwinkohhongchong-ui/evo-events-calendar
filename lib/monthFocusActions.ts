import { supabase } from "./supabase";
import { MonthFocusValues } from "./types";

export async function upsertMonthFocus(
  year: number,
  month: number,
  values: MonthFocusValues
): Promise<void> {
  const { error } = await supabase
    .from("month_focus")
    .upsert({ year, month, ...values }, { onConflict: "year,month" });
  if (error) throw new Error(error.message);
}
