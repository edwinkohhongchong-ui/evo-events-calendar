// "Big event" flag (migration 028). Pure helpers only (no Supabase), shared by
// lib/rowWrites.ts and lib/actions.ts.

export const MAJOR_MIGRATION_HINT = "Big event isn't switched on yet. Please tell Edwin.";

/**
 * Returns `values` with `is_major` only where it is safe to send. The column
 * may not exist yet (migration 028), so it is included when true, or as an
 * explicit boolean when `canClear` (the existing row proves the column exists)
 * so an edit can switch it off. Anything that is not a real boolean is dropped.
 */
export function withMajor<T>(values: T & { is_major?: unknown }, canClear = false): Omit<T, "is_major"> & { is_major?: boolean } {
  const { is_major, ...rest } = values;
  if (is_major === true || (canClear && is_major === false)) return { ...rest, is_major } as Omit<T, "is_major"> & { is_major: boolean };
  return rest as Omit<T, "is_major">;
}

/** 42703 = column missing, PGRST204/PGRST205 = PostgREST schema cache lacks it. */
export function isMissingMajorColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const missing =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (/is_major/i.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? ""));
  if (missing) console.error("is_major column missing: run migration 028.", error);
  return missing;
}
