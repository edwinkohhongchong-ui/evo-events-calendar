import { Level } from "./types";

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
