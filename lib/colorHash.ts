// Simple deterministic string hash (FNV-1a) — stable across reloads, so the
// same name always suggests the same color. Not random. Shared by Seasons
// and Levels, both of which auto-suggest a color from a fixed palette.
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
