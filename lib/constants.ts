import { ChecklistStatus, HolidayType, Level, SeasonCategory, TargetMonth } from "./types";

export const LEVELS: Level[] = [
  "Churchwide",
  "Youth",
  "Tertiary",
  "Adults",
  "COW",
  "Thirdspace",
  "Gathering",
];

export const LEVEL_COLORS: Record<Level, string> = {
  Churchwide: "bg-indigo-100 text-indigo-800 border-indigo-300",
  Youth: "bg-orange-100 text-orange-800 border-orange-300",
  Tertiary: "bg-purple-100 text-purple-800 border-purple-300",
  Adults: "bg-teal-100 text-teal-800 border-teal-300",
  COW: "bg-rose-100 text-rose-800 border-rose-300",
  Thirdspace: "bg-sky-100 text-sky-800 border-sky-300",
  Gathering: "bg-amber-100 text-amber-800 border-amber-300",
};

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
