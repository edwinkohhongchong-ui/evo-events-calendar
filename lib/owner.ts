// Owner = a free-text person name on an event or a checklist item. Pure
// helpers only (no Supabase), shared by the Server Actions and the UI.

export const OWNER_MAX = 60;

export const OWNER_MIGRATION_HINT = "Owner needs the latest database update. Run migration 025 first.";

/** Trimmed, inner whitespace collapsed. Empty string when there is nothing. */
export function normalizeOwner(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Server-side validation: null/undefined/blank -> null; a non-string or a
 * name over OWNER_MAX throws a message that is safe to show the user.
 */
export function parseOwner(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new Error("Owner must be a name.");
  const value = normalizeOwner(raw);
  if (value.length > OWNER_MAX) throw new Error(`Owner must be ${OWNER_MAX} characters or fewer.`);
  return value || null;
}

/**
 * Returns `values` with a validated `owner`. The column may not exist yet
 * (migration 025), so owner is only included when it is a non-empty name, or
 * as an explicit null when `canClear` (the existing row proves the column
 * exists) so an edit can remove an owner.
 */
export function withOwner<T>(
  values: T & { owner?: string | null },
  canClear = false
): Omit<T, "owner"> & { owner?: string | null } {
  const { owner, ...rest } = values;
  const parsed = parseOwner(owner);
  if (parsed) return { ...rest, owner: parsed } as Omit<T, "owner"> & { owner: string };
  return (canClear ? { ...rest, owner: null } : rest) as Omit<T, "owner"> & { owner?: string | null };
}

/** 42703 = column missing, PGRST204/PGRST205 = PostgREST schema cache lacks it. */
export function isMissingOwnerColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") return true;
  return /owner/i.test(error.message ?? "") && /column|schema cache/i.test(error.message ?? "");
}

/** Case-insensitive, trimmed name match. Blank on either side never matches. */
export function ownerMatches(owner: string | null | undefined, name: string | null | undefined): boolean {
  const a = normalizeOwner(owner).toLowerCase();
  const b = normalizeOwner(name).toLowerCase();
  return a !== "" && a === b;
}

/**
 * Distinct owner names for a datalist: case-insensitive de-dupe keeping the
 * first spelling seen, blanks dropped, alphabetical.
 */
export function buildOwnerOptions(names: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const n of names) {
    const v = normalizeOwner(n);
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * "Mine" filter for checklist rows: an item's own owner wins; an item with
 * none inherits its event's owner (template items start with no owner).
 */
export function filterRowsByOwner<T extends { owner?: string | null; event: { owner?: string | null } }>(
  rows: readonly T[],
  name: string | null | undefined
): T[] {
  return rows.filter((r) => ownerMatches(normalizeOwner(r.owner) ? r.owner : r.event.owner, name));
}
