import { SEASON_COLOR_KEYS } from "./constants";
import { SeasonColorKey } from "./types";

// Simple deterministic string hash (FNV-1a) — stable across reloads, so the
// same season name always suggests the same color. Not random.
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Hashes on name, not category — two seasons in the same category (e.g.
// "Growth Cycle 1" and "Growth Cycle 2") would otherwise suggest identical
// colors, defeating the point of telling adjacent bars apart at a glance.
export function suggestSeasonColor(name: string): SeasonColorKey {
  const index = hashString(name) % SEASON_COLOR_KEYS.length;
  return SEASON_COLOR_KEYS[index];
}

// Resolves the color actually used for rendering: the stored color if set,
// otherwise the live auto-suggestion. A null color is not a gap to backfill —
// the suggestion computed here IS the answer for uncolored seasons.
export function resolveSeasonColor(season: { name: string; color: SeasonColorKey | null }): SeasonColorKey {
  return season.color ?? suggestSeasonColor(season.name);
}
