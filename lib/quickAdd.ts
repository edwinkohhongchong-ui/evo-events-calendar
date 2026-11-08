import type { EventFormValues } from "./actions";
import { isValidDateStr, MAX_YEAR, MIN_YEAR } from "./dates";
import { applyTitlePrefix, type PastoralFocus } from "./pastoralFocus";

type Named = { name: string };

/**
 * Buttons for the Event-type picker (shared by EventModal and the quick-add
 * popover): every category by its exact name, in `levels` order with
 * Churchwide first. "Gathering" is a Gathering-type category, not an Event
 * type, so it is left out.
 */
export function eventTypeButtonNames(levels: Named[]): string[] {
  return levels
    .filter((l) => l.name !== "Gathering")
    .map((l) => l.name)
    .sort((x, y) => (x === "Churchwide" ? -1 : y === "Churchwide" ? 1 : 0));
}

/** Native date input bounds (the year range the calendar supports). */
export const DATE_INPUT_MIN = `${MIN_YEAR}-01-01`;
export const DATE_INPUT_MAX = `${MAX_YEAR}-12-31`;

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
  /** Pastoral focus pills; absent means none chosen. */
  pastoral?: PastoralFocus;
}

export const NO_PASTORAL_FOCUS: PastoralFocus = { youth: false, poly: false, uni: false, adults: false };

/** Pill order and labels, same as the full modal. */
export const PASTORAL_PILLS: Array<[keyof PastoralFocus, string]> = [
  ["youth", "Youth"],
  ["poly", "Poly"],
  ["uni", "Uni"],
  ["adults", "Adults"],
];

/** Same rules and wording as the full modal; null when the form can be saved. */
export function validateQuickAdd(input: QuickAddInput, levels: Named[]): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.date) return "Date is required.";
  if (!isValidDateStr(input.date)) return "Pick a valid date.";
  const year = Number(input.date.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return `Pick a date between ${MIN_YEAR} and ${MAX_YEAR}.`;
  if (!input.level) return "Choose a category.";
  if (!levels.some((l) => l.name === input.level)) {
    return `There's no “${input.level}” category. Add it with + Category (exact name), then try again.`;
  }
  return null;
}

/** createEvent payload for a plain single-day, non-recurring Event. */
export function buildQuickAddValues(input: QuickAddInput): EventFormValues {
  const focus = input.pastoral ?? NO_PASTORAL_FOCUS;
  return {
    name: applyTitlePrefix(input.name.trim(), focus),
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
    pastoral_youth: focus.youth,
    pastoral_poly: focus.poly,
    pastoral_uni: focus.uni,
    pastoral_adults: focus.adults,
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

/** What the popover hands over when "More options" is clicked. */
export interface QuickAddHandoff {
  name: string;
  time: string;
  level: string;
  pastoral: PastoralFocus;
}

/**
 * Add-modal prefill from a quick-add draft. The name stays raw: EventModal
 * applies the Y/P/U/A prefix itself on save, so passing a prefixed name here
 * would double it.
 */
export function handoffToModalInitial(draft: QuickAddHandoff) {
  return {
    initialName: draft.name,
    initialTime: draft.time,
    initialLevel: draft.level,
    initialPastoral: draft.pastoral,
  };
}
