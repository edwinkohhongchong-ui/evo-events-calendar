import type { ColorValue, HolidayType, SeasonCategory } from "../types";
import { addDays, eachDay } from "./dateText";
import { labelKind } from "./labels";
import type { Flag, ParsedItem, ParsedSchedule, ScheduleSection } from "./types";

// Naming follows what the app already uses (supabase_schema.sql seed + the
// exam-source groups): holidays "Chinese New Year (Day 1)", "Vesak Day (In-Lieu)",
// "Christmas Day"; seasons "Poly Holidays", "Poly Examinations", "Uni ...".
export const OBSERVED_SUFFIX = "In-Lieu";
export const TENTATIVE_SUFFIX = "tentative";

const HOLIDAY_ALIASES: Record<string, string> = {
  christmas: "Christmas Day",
};

export interface PlannedBase {
  /** Stable identity for diffing: kind|normalised name|start|end (see normaliseKeyName). */
  key: string;
  source: { line: number; text: string };
  tentative: boolean;
  flags: Flag[];
  /** True when an error-severity flag is present; the UI must not apply these as-is. */
  invalid: boolean;
}

export interface PlannedHoliday extends PlannedBase {
  kind: "holiday";
  date: string;
  name: string;
  type: HolidayType;
}

export interface PlannedSeason extends PlannedBase {
  kind: "season";
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string;
  color?: ColorValue;
}

export interface PlannedSchedule {
  docYear: number | null;
  holidays: PlannedHoliday[];
  seasons: PlannedSeason[];
}

export function normaliseKeyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\(\s*(?:tentative|approx\.?)\s*\)/g, " ")
    .replace(/\(\s*(?:observed|in-lieu)\s*\)/g, "(in-lieu)")
    .replace(/\s+/g, " ")
    .trim();
}

function holidayKey(name: string, date: string): string {
  return `holiday|${normaliseKeyName(name)}|${date}|${date}`;
}

function seasonKey(name: string, category: SeasonCategory, start: string, end: string): string {
  return `season|${normaliseKeyName(name)}|${category}|${start}|${end}`;
}

const MINOR_WORDS = new Set(["and", "of", "the", "after", "for", "to", "in"]);

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) =>
      i > 0 && MINOR_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

/** Drops a year printed inside a label ("1st week of 2025 Semester 2") - it is
 *  routinely wrong or confusing (NTU's says 2024) and the dates carry the truth. */
function tidyLabel(label: string): string {
  return titleCase(label.replace(/\b20\d{2}\s+/g, "").replace(/\s+/g, " ").trim());
}

function publicHolidayName(label: string): string {
  const fixed = label.replace(/[‘’]/g, "'").trim();
  return HOLIDAY_ALIASES[fixed.toLowerCase()] ?? fixed;
}

function hasError(flags: Flag[]): boolean {
  return flags.some((f) => f.severity === "error");
}

function classifyHolidays(item: ParsedItem): PlannedHoliday[] {
  const base = publicHolidayName(item.label);
  const suffix = item.tentative ? ` (${TENTATIVE_SUFFIX})` : "";
  const type: HolidayType = item.tentative
    ? "National (SG Public Holiday, provisional)"
    : "National (SG Public Holiday)";
  const days = item.end >= item.start ? eachDay(item.start, item.end) : [item.start];
  const make = (date: string, name: string): PlannedHoliday => {
    const full = `${name}${suffix}`;
    return {
      kind: "holiday",
      date,
      name: full,
      type,
      key: holidayKey(full, date),
      source: { line: item.sourceLine, text: item.sourceText },
      tentative: item.tentative,
      flags: item.flags,
      invalid: hasError(item.flags),
    };
  };
  const out = days.map((d, i) => make(d, days.length > 1 ? `${base} (Day ${i + 1})` : base));
  if (item.observedDate) out.push(make(item.observedDate, `${base} (${OBSERVED_SUFFIX})`));
  return out;
}

const SECTION_PREFIX: Record<ScheduleSection, string> = {
  "Public Holidays": "",
  "Primary School": "Primary School",
  "Secondary School": "Secondary School",
  "Junior College": "JC",
  Polytechnic: "Poly",
  University: "Uni",
};

function instSuffix(item: ParsedItem): string {
  return item.institutions?.length ? ` (${item.institutions.join(", ")})` : "";
}

function seasonNameAndCategory(item: ParsedItem): { name: string; category: SeasonCategory } {
  const kind = labelKind(item.label);
  const label = tidyLabel(item.label);
  const sectionPrefix = item.section ? SECTION_PREFIX[item.section] : "";

  if (item.group === "School Holidays") {
    const name = item.section === "Junior College" ? "JC Holidays" : `${sectionPrefix} Holidays`;
    return { name, category: "School Schedule" };
  }
  if (item.group && ["PSLE", "N Level", "O Level", "A Level"].includes(item.group)) {
    return { name: `${item.group} ${label}`, category: "Exam Period" };
  }
  if (item.section === "Polytechnic") {
    if (/\b(vacation|term break)\b/i.test(item.label) && !/(?:1st|first) week/i.test(item.label)) {
      return { name: `Poly Holidays${instSuffix(item)}`, category: "School Schedule" };
    }
    if (/\bexam/i.test(item.label)) {
      return { name: `Poly Examinations${instSuffix(item)}`, category: "Exam Period" };
    }
    return {
      name: `Poly ${label}${instSuffix(item)}`,
      category: kind === "exam" ? "Exam Period" : kind === "schedule" ? "School Schedule" : "Other",
    };
  }
  if (item.section === "University") {
    const inst = item.institutions?.join(", ") ?? "Uni";
    return {
      name: `${inst} ${label}`,
      category: kind === "exam" ? "Exam Period" : kind === "schedule" ? "School Schedule" : "Other",
    };
  }
  return {
    name: [sectionPrefix, label].filter(Boolean).join(" "),
    category: kind === "exam" ? "Exam Period" : kind === "schedule" ? "School Schedule" : "Other",
  };
}

function mergeContiguous(items: ParsedItem[]): ParsedItem[] {
  // "Oral: 12 August 2026 and 13 August 2026" is really one two-day period.
  const out: ParsedItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    const same =
      prev &&
      prev.sourceLine === it.sourceLine &&
      prev.label === it.label &&
      prev.group === it.group &&
      prev.section === it.section &&
      (prev.institutions ?? []).join() === (it.institutions ?? []).join() &&
      prev.end >= prev.start &&
      it.start === addDays(prev.end, 1) &&
      !hasError(prev.flags) &&
      !hasError(it.flags);
    if (same) {
      out[out.length - 1] = { ...prev, end: it.end, notes: Array.from(new Set([...prev.notes, ...it.notes])) };
    } else out.push(it);
  }
  return out;
}

function seasonNotes(item: ParsedItem): string {
  const parts: string[] = [];
  if (item.tentative) parts.push(`Tentative: ${item.tentativeText ?? "dates not yet confirmed"}`);
  parts.push(...item.notes.filter((n) => n !== item.tentativeText && !/^(tentative|subject to confirmation)$/i.test(n)));
  return parts.join("; ");
}

export function classifySchedule(parsed: ParsedSchedule): PlannedSchedule {
  const holidays: PlannedHoliday[] = [];
  const seasons: PlannedSeason[] = [];
  const dated = parsed.items.filter((i) => i.section !== "Public Holidays");

  for (const item of parsed.items) {
    if (item.section === "Public Holidays") holidays.push(...classifyHolidays(item));
  }
  for (const item of mergeContiguous(dated)) {
    const { name, category } = seasonNameAndCategory(item);
    seasons.push({
      kind: "season",
      name,
      category,
      start_date: item.start,
      end_date: item.end,
      notes: seasonNotes(item),
      key: seasonKey(name, category, item.start, item.end),
      source: { line: item.sourceLine, text: item.sourceText },
      tentative: item.tentative,
      flags: item.flags,
      invalid: hasError(item.flags),
    });
  }
  return { docYear: parsed.docYear, holidays, seasons };
}
