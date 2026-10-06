// Details = optional longer remarks on calendar day notes and holidays
// (both added by migration 027). Pure helpers only (no Supabase), shared by
// the Server Actions, lib/rowWrites.ts and the UI.

export const DAY_NOTE_DETAILS_MAX = 2000;

export const DAY_NOTE_DETAILS_MIGRATION_HINT = "Details aren't switched on yet. Please tell Edwin.";

/**
 * Server-side validation: null/undefined/blank -> null; a non-string or text
 * over DAY_NOTE_DETAILS_MAX throws a message that is safe to show the user.
 * Inner line breaks are kept (unlike owner names).
 */
export function normaliseNoteDetails(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new Error("Details must be text.");
  const value = raw.trim();
  if (value.length > DAY_NOTE_DETAILS_MAX) {
    throw new Error(`Details can be at most ${DAY_NOTE_DETAILS_MAX} characters.`);
  }
  return value || null;
}

/** 42703 = column missing, PGRST204 = PostgREST schema cache lacks it. */
export function isMissingDetailsColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const missing =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (/details/i.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? ""));
  // The user-facing text is deliberately plain; the real fix goes in the server log.
  if (missing) console.error("details column missing (day_notes/holidays): run migration 027.", error);
  return missing;
}
