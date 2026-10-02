import { MAX_YEAR, MIN_YEAR } from "./dates";

// Helpers for the Print Calendar page's "Print Calendar" card and /export/print.
// A month is identified by a "yyyy-MM" key; keys sort chronologically as strings.

export const MAX_PRINT_MONTHS = 24;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface PrintMonth {
  key: string;
  year: number;
  month: number; // 1-12
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function inRange(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/** Parses one "yyyy-MM" key; null when malformed or the year is out of range. */
export function parseMonthKey(raw: string): PrintMonth | null {
  const m = KEY_RE.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  if (!inRange(year)) return null;
  return { key: raw, year, month: Number(m[2]) };
}

export type ParsedMonths = { ok: true; months: PrintMonth[] } | { ok: false; error: string };

/**
 * Validates the `months` query param (comma-separated yyyy-MM). Any bad entry
 * rejects the whole list so a typo never silently prints the wrong months.
 * Result is de-duplicated and sorted chronologically.
 */
export function parseMonthsParam(raw: string | string[] | undefined): ParsedMonths {
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  if (!text || !text.trim()) return { ok: false, error: "No months were chosen." };
  const seen = new Map<string, PrintMonth>();
  for (const part of text.split(",")) {
    const parsed = parseMonthKey(part.trim());
    if (!parsed) return { ok: false, error: `"${part.trim().slice(0, 20)}" is not a valid month.` };
    seen.set(parsed.key, parsed);
  }
  if (seen.size > MAX_PRINT_MONTHS) {
    return { ok: false, error: `Choose at most ${MAX_PRINT_MONTHS} months at a time.` };
  }
  const months = Array.from(seen.values()).sort((a, b) => a.key.localeCompare(b.key));
  return { ok: true, months };
}

/** Sorted, de-duplicated copy of the keys that are valid months. */
export function sortMonthKeys(keys: Iterable<string>): string[] {
  const valid = new Set<string>();
  for (const k of Array.from(keys)) if (parseMonthKey(k)) valid.add(k);
  return Array.from(valid).sort();
}

export function monthKeysForYear(year: number): string[] {
  return MONTH_ABBR.map((_, i) => monthKey(year, i + 1));
}

/** `count` consecutive months starting at the month of `todayDateStr` ("yyyy-MM-dd"). Keys outside the allowed year range are dropped. */
export function monthKeysFrom(todayDateStr: string, count: number): string[] {
  const year = Number(todayDateStr.slice(0, 4));
  const month = Number(todayDateStr.slice(5, 7));
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = month - 1 + i;
    keys.push(monthKey(year + Math.floor(idx / 12), (idx % 12) + 1));
  }
  return sortMonthKeys(keys);
}

export function clampPrintYear(year: number): number {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.trunc(year)));
}

export function monthLabel(key: string): string {
  const p = parseMonthKey(key);
  return p ? `${MONTH_ABBR[p.month - 1]} ${p.year}` : key;
}

/** "Oct 2026, Nov 2026" (chronological), or "" when empty. */
export function summarizeMonthKeys(keys: Iterable<string>): string {
  return sortMonthKeys(keys).map(monthLabel).join(", ");
}

export function printHref(keys: Iterable<string>): string {
  return `/export/print?months=${sortMonthKeys(keys).join(",")}`;
}

export const MONTH_ABBREVIATIONS = MONTH_ABBR;
