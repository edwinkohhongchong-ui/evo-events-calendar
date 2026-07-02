import { HolidayRow, HolidayType } from "./types";

// Calendarific has no dedicated "this date might shift" field — its `type`
// array is just classification strings like "National holiday" or
// "Religious". This heuristic is deliberately narrow: it matches the exact
// precedent already set by this app's own seed data, where only Hari Raya
// Puasa/Haji are marked provisional (subject to MUIS moon-sighting
// confirmation) — NOT Vesak Day, Deepavali, or Chinese New Year, which are
// also lunar-calendar-derived but computed with certainty, not confirmed
// later. A broader "any non-Gregorian holiday" heuristic would over-flag
// those and not match house convention. This is a nudge for the human
// reviewer, not a guarantee — every row needs approval regardless.
const TENTATIVE_NAME_PATTERNS = ["hari raya"];
const TENTATIVE_TYPE_KEYWORDS = ["muslim", "islamic"];

export function isTentativeHoliday(name: string, rawType: string[]): boolean {
  const lowerName = name.toLowerCase();
  const lowerTypes = rawType.map((t) => t.toLowerCase());
  return (
    TENTATIVE_NAME_PATTERNS.some((p) => lowerName.includes(p)) ||
    TENTATIVE_TYPE_KEYWORDS.some((k) => lowerTypes.some((t) => t.includes(k)))
  );
}

// Suggests one of this app's fixed HOLIDAY_TYPES from Calendarific's raw
// type array — a starting point, always shown as an editable dropdown in
// the review UI, never written without the human seeing/confirming it.
export function suggestHolidayType(rawType: string[], isTentative: boolean): HolidayType {
  if (isTentative) return "National (SG Public Holiday, provisional)";
  const lowerTypes = rawType.map((t) => t.toLowerCase());
  if (lowerTypes.some((t) => t.includes("national"))) return "National (SG Public Holiday)";
  if (lowerTypes.some((t) => t.includes("observance"))) return "National (SG Observance)";
  return "Custom";
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Classifies one Calendarific holiday against existing DB rows for the same
// year, keyed by exact date match:
// - "new": no existing row on this date.
// - "existing": an existing row on this date with a matching (normalized)
//   name — already recognized, not silently dropped.
// - "collision": an existing row on this date with a DIFFERENT name — real,
//   not hypothetical (e.g. this app's own 2026 data combines Chinese New
//   Year Day 2 and Ash Wednesday into one row for one date). Requires a
//   human decision, never auto-resolved either way.
export function classifyHoliday(
  apiHoliday: { date: string; name: string },
  existingByDate: Map<string, HolidayRow>
): { bucket: "new" | "existing" | "collision"; existingName: string | null } {
  const existing = existingByDate.get(apiHoliday.date);
  if (!existing) return { bucket: "new", existingName: null };
  if (normalizeName(existing.name) === normalizeName(apiHoliday.name)) {
    return { bucket: "existing", existingName: existing.name };
  }
  return { bucket: "collision", existingName: existing.name };
}
