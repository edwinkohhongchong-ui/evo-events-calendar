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
  "red",
  "yellow",
  "blue",
  "green",
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
  red: "bg-red-200 text-red-900 border-red-400",
  yellow: "bg-yellow-200 text-yellow-900 border-yellow-400",
  blue: "bg-blue-200 text-blue-900 border-blue-400",
  green: "bg-green-200 text-green-900 border-green-400",
};

// Levels (event categories) share the exact same palette as Seasons —
// aliased under Level-specific names for readability at call sites.
export const LEVEL_COLOR_KEYS: SeasonColorKey[] = SEASON_COLOR_KEYS;
export const LEVEL_COLOR_CLASSES: Record<SeasonColorKey, string> = SEASON_BAR_COLORS;

// Soft tinted single-day event chips (Phase 2 redesign). Additive to
// LEVEL_COLOR_CLASSES, which multi-day bars, season bars and other screens
// still use unchanged. Same hue per key: ~22% tint + 3px full-colour left
// bar + ink text. LEVEL_DOT_CLASSES is the legend dot (same -500 as the bar).
// Literal class strings so Tailwind's scanner picks them up.
export const LEVEL_CHIP_CLASSES: Record<SeasonColorKey, string> = {
  indigo: "bg-indigo-500/[0.22] border-l-[3px] border-indigo-500 text-ink",
  teal: "bg-teal-500/[0.22] border-l-[3px] border-teal-500 text-ink",
  rose: "bg-rose-500/[0.22] border-l-[3px] border-rose-500 text-ink",
  amber: "bg-amber-500/[0.22] border-l-[3px] border-amber-500 text-ink",
  sky: "bg-sky-500/[0.22] border-l-[3px] border-sky-500 text-ink",
  purple: "bg-purple-500/[0.22] border-l-[3px] border-purple-500 text-ink",
  emerald: "bg-emerald-500/[0.22] border-l-[3px] border-emerald-500 text-ink",
  orange: "bg-orange-500/[0.22] border-l-[3px] border-orange-500 text-ink",
  pink: "bg-pink-500/[0.22] border-l-[3px] border-pink-500 text-ink",
  cyan: "bg-cyan-500/[0.22] border-l-[3px] border-cyan-500 text-ink",
  red: "bg-red-500/[0.22] border-l-[3px] border-red-500 text-ink",
  yellow: "bg-yellow-500/[0.22] border-l-[3px] border-yellow-500 text-ink",
  blue: "bg-blue-500/[0.22] border-l-[3px] border-blue-500 text-ink",
  green: "bg-green-500/[0.22] border-l-[3px] border-green-500 text-ink",
};

export const LEVEL_DOT_CLASSES: Record<SeasonColorKey, string> = {
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
};

// The "Event Type" grouping shown in the Add/Edit Event form for Event-type
// entries (Gatherings keep their own separate, unchanged Level picker — see
// EventModal.tsx). Churchwide and TG are picked directly; Zone expands into
// one of ZONE_LEVEL_NAMES. These are Level names (rows in the `levels`
// table, migration 016) — this is a UI grouping over the existing flat
// Level field, not a new column.
export const CHURCHWIDE_LEVEL_NAME = "Churchwide";
export const TG_LEVEL_NAME = "TG";
export const ZONE_LEVEL_NAMES = ["Youth", "Poly", "Uni", "Adults", "COW/Thirdspace"];

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
