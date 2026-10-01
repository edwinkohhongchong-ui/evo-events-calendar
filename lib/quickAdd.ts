import type { EventFormValues } from "./actions";
import { ZONE_LEVEL_NAMES } from "./constants";

type Named = { name: string };

/** Zone categories that currently exist, in the order of `levels`. */
export function zoneLevelsOf<T extends Named>(levels: T[]): T[] {
  return levels.filter((l) => ZONE_LEVEL_NAMES.includes(l.name));
}

/**
 * Buttons for the Event-type picker (shared by EventModal and the quick-add
 * popover): every non-zone category by its exact name with Churchwide first,
 * "Zone" right after it when any zone category exists. "Gathering" is a
 * Gathering-type category, not an Event type, so it is left out.
 */
export function eventTypeButtonNames(levels: Named[]): string[] {
  const direct = levels
    .filter((l) => !ZONE_LEVEL_NAMES.includes(l.name) && l.name !== "Gathering")
    .map((l) => l.name)
    .sort((x, y) => (x === "Churchwide" ? -1 : y === "Churchwide" ? 1 : 0));
  if (zoneLevelsOf(levels).length === 0) return direct;
  const head = direct[0] === "Churchwide" ? 1 : 0;
  return [...direct.slice(0, head), "Zone", ...direct.slice(head)];
}

/** Which button is lit for a level; "Zone" for a zone level or an undecided zone pick. */
export function displayCategoryFor(levelName: string, zonePickedWithoutLevel = false): string {
  if (levelName) return ZONE_LEVEL_NAMES.includes(levelName) ? "Zone" : levelName;
  return zonePickedWithoutLevel ? "Zone" : "";
}

/** The remembered level if it still exists as an Event type, otherwise "" (force a choice). */
export function defaultQuickLevel(remembered: string | null | undefined, levels: Named[]): string {
  if (!remembered || remembered === "Gathering") return "";
  return levels.some((l) => l.name === remembered) ? remembered : "";
}

export interface QuickAddInput {
  name: string;
  date: string;
  time: string;
  level: string;
  /** "Zone" was clicked but no zone chosen yet. */
  zonePickedWithoutLevel?: boolean;
}

/** Same rules and wording as the full modal; null when the form can be saved. */
export function validateQuickAdd(input: QuickAddInput, levels: Named[]): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.date) return "Date is required.";
  if (!input.level) return input.zonePickedWithoutLevel ? "Choose a zone." : "Choose an Event Type.";
  if (!levels.some((l) => l.name === input.level)) {
    return `There's no “${input.level}” category. Add it with + Category (exact name), then try again.`;
  }
  return null;
}

/** createEvent payload for a plain single-day, non-recurring Event. */
export function buildQuickAddValues(input: QuickAddInput): EventFormValues {
  return {
    name: input.name.trim(),
    event_date: input.date,
    end_date: null,
    event_time: input.time || null,
    end_time: null,
    duration_minutes: null,
    level: input.level,
    location: null,
    recurring: "None",
    repeat_until: null,
    notes: null,
    event_type: "Event",
    pastoral_youth: false,
    pastoral_poly: false,
    pastoral_uni: false,
    pastoral_adults: false,
    gathering_type: null,
    series: null,
    preacher_name: null,
    sermon_title: null,
    theme: null,
  };
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GAP = 8;

/**
 * Top-left for a popover of `size` next to `anchor`, kept inside `viewport`:
 * right of the anchor, else left of it, else centred on it; top-aligned with
 * the anchor, shifted up when it would run off the bottom.
 */
export function placePopover(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const maxLeft = Math.max(GAP, viewport.width - size.width - GAP);
  const maxTop = Math.max(GAP, viewport.height - size.height - GAP);
  let left: number;
  if (anchor.right + GAP + size.width <= viewport.width - GAP) left = anchor.right + GAP;
  else if (anchor.left - GAP - size.width >= GAP) left = anchor.left - GAP - size.width;
  else left = (anchor.left + anchor.right) / 2 - size.width / 2;
  const top = Math.min(Math.max(anchor.top, GAP), maxTop);
  return { left: Math.min(Math.max(left, GAP), maxLeft), top };
}

const LAST_LEVEL_KEY = "evo:quickAddLevel";

export function readLastQuickLevel(): string | null {
  try {
    return sessionStorage.getItem(LAST_LEVEL_KEY);
  } catch {
    return null;
  }
}

export function writeLastQuickLevel(level: string): void {
  try {
    sessionStorage.setItem(LAST_LEVEL_KEY, level);
  } catch {
    // storage blocked: the default simply isn't remembered
  }
}
