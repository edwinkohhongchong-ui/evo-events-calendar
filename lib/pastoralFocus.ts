// Pastoral Focus drives the Y/P/U/A title prefix on Type 1 "Event" entries
// (e.g. Youth + Poly checked -> "YP: Study Mining"). Deliberately independent
// of `level` — see migration 008.
export interface PastoralFocus {
  youth: boolean;
  poly: boolean;
  uni: boolean;
  adults: boolean;
}

// Order fixes the prefix's letter order (Y, P, U, A) regardless of which
// order the checkboxes were ticked in.
const LETTERS: Array<[keyof PastoralFocus, string]> = [
  ["youth", "Y"],
  ["poly", "P"],
  ["uni", "U"],
  ["adults", "A"],
];

const PREFIX_REGEX = /^([YPUA]{1,4}): /;

// The name as stored always carries the prefix baked in (per PROJECT
// decision — the user wants it visible on the saved title, not just
// computed at render time). These two functions make that round-trip
// idempotent: stripping before re-applying means toggling checkboxes on/off
// across repeated saves never doubles up or leaves a stale prefix behind.
export function stripTitlePrefix(name: string): string {
  return name.replace(PREFIX_REGEX, "");
}

export function applyTitlePrefix(baseName: string, focus: PastoralFocus): string {
  const letters = LETTERS.filter(([key]) => focus[key])
    .map(([, letter]) => letter)
    .join("");
  return letters ? `${letters}: ${baseName}` : baseName;
}
