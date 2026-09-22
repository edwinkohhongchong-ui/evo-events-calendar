import { LEVEL_COLOR_KEYS } from "./constants";
import { SeasonColorKey } from "./types";
import { hashString } from "./colorHash";

// Same palette/hash approach as Seasons (see lib/seasonColor.ts) — Tailwind's
// content scanner needs literal class strings in source, so an auto-suggested
// color has to resolve to one of a fixed, pre-written set, not a computed hex.
export function suggestLevelColor(name: string): SeasonColorKey {
  const index = hashString(name) % LEVEL_COLOR_KEYS.length;
  return LEVEL_COLOR_KEYS[index];
}

// Resolves the color actually used for rendering: the stored color if set,
// otherwise the live auto-suggestion.
export function resolveLevelColor(level: { name: string; color_key: SeasonColorKey | null }): SeasonColorKey {
  return level.color_key ?? suggestLevelColor(level.name);
}
