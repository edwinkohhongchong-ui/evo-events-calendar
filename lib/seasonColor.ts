import { SEASON_COLOR_KEYS } from "./constants";
import { ColorValue, SeasonColorKey } from "./types";
import { hashString } from "./colorHash";

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
export function resolveSeasonColor(season: { name: string; color: ColorValue | null }): ColorValue {
  return season.color ?? suggestSeasonColor(season.name);
}
