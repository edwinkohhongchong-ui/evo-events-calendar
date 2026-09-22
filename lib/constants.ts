import { ChecklistStatus, GatheringType, HolidayType, SeasonCategory, SeasonColorKey, TargetMonth } from "./types";

export const GATHERING_TYPES: GatheringType[] = [
  "Gathering",
  "YTH Gathering",
  "+EVO YTH Big Day",
  "Easter/XMAS",
];

export const HOLIDAY_TYPES: HolidayType[] = [
  "National (SG Public Holiday)",
  "National (SG Public Holiday, provisional)",
  "National (SG Observance)",
  "School Schedule",
  "International Observance",
  "Church Observance",
  "Custom",
];

export const SEASON_CATEGORIES: SeasonCategory[] = [
  "Ministry Season",
  "School Schedule",
  "Exam Period",
  "Growth Track",
  "Other",
];

export const CHECKLIST_STATUSES: ChecklistStatus[] = ["Not Started", "In Progress", "Done"];

export const STATUS_COLORS: Record<ChecklistStatus, string> = {
  "Not Started": "bg-red-100 text-red-800 border-red-300",
  "In Progress": "bg-yellow-100 text-yellow-800 border-yellow-300",
  Done: "bg-green-100 text-green-800 border-green-300",
};

// Palette keys, not raw hex — every class string below is a literal in source
// so Tailwind's content scanner sees it. See PROJECT decision: a raw hex would
// need inline styles instead, since arbitrary runtime values can't be picked
// up by Tailwind's static scanning (bit us once already — see Phase 3 fix to
// tailwind.config.ts content globs).
export const SEASON_COLOR_KEYS: SeasonColorKey[] = [
  "indigo",
  "teal",
  "rose",
  "amber",
  "sky",
  "purple",
  "emerald",
  "orange",
  "pink",
  "cyan",
];

export const SEASON_BAR_COLORS: Record<SeasonColorKey, string> = {
  indigo: "bg-indigo-200 text-indigo-900 border-indigo-400",
  teal: "bg-teal-200 text-teal-900 border-teal-400",
  rose: "bg-rose-200 text-rose-900 border-rose-400",
  amber: "bg-amber-200 text-amber-900 border-amber-400",
  sky: "bg-sky-200 text-sky-900 border-sky-400",
  purple: "bg-purple-200 text-purple-900 border-purple-400",
  emerald: "bg-emerald-200 text-emerald-900 border-emerald-400",
  orange: "bg-orange-200 text-orange-900 border-orange-400",
  pink: "bg-pink-200 text-pink-900 border-pink-400",
  cyan: "bg-cyan-200 text-cyan-900 border-cyan-400",
};

// Levels (event categories) share the exact same 10-key palette as Seasons —
// aliased under Level-specific names for readability at call sites.
export const LEVEL_COLOR_KEYS: SeasonColorKey[] = SEASON_COLOR_KEYS;
export const LEVEL_COLOR_CLASSES: Record<SeasonColorKey, string> = SEASON_BAR_COLORS;

export const TARGET_MONTHS: TargetMonth[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
