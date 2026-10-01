"use server";

import { supabase } from "./supabase";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";

export interface SeasonSourceDateEntry {
  group_name: string;
  institution: string;
  start_date: string | null;
  end_date: string | null;
}

// Upserts one row per institution for `year`, keyed on (group_name,
// institution, year) — see migration 021's unique constraint. Deliberately
// not part of the undo system (lib/undo/*): these rows are a manual-entry
// aggregation input, not a user-facing calendar item in their own right (the
// derived `seasons` row they feed is already undo-tracked via
// createSeason/updateSeason).
async function saveSeasonSourceDatesImpl(
  year: number,
  entries: SeasonSourceDateEntry[]
): Promise<void> {
  await requireRole("editor");
  if (entries.length === 0) return;

  const rows = entries.map((e) => ({
    group_name: e.group_name,
    institution: e.institution,
    year,
    start_date: e.start_date,
    end_date: e.end_date,
  }));

  const { error } = await supabase
    .from("season_source_dates")
    .upsert(rows, { onConflict: "group_name,institution,year" });

  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving these dates. Please try again.");
  }
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function saveSeasonSourceDates(...args: Parameters<typeof saveSeasonSourceDatesImpl>) {
  return runAction(() => saveSeasonSourceDatesImpl(...args));
}
