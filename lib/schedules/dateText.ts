// Calendar-date helpers working purely on "yyyy-MM-dd" strings. Date.UTC is
// used only for day arithmetic, never local time, so there is no timezone
// drift (see the note at the top of lib/dates.ts).

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export const MONTH_PATTERN =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

export function monthNumber(name: string): number {
  const key = name.toLowerCase().slice(0, 3);
  const idx = MONTH_NAMES.findIndex((m) => m.startsWith(key));
  return idx + 1;
}

export function monthName(month: number): string {
  const n = MONTH_NAMES[month - 1] ?? "";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isRealDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(toUtc(iso) + days * 86_400_000);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Every date from start to end inclusive (empty if end < start). */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  return e < s ? 0 : Math.round((toUtc(e) - toUtc(s)) / 86_400_000) + 1;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Scanning free text for dates
// ---------------------------------------------------------------------------

export type ScanToken =
  | { kind: "range" | "single"; index: number; length: number; start: string; end: string }
  | { kind: "paren"; index: number; length: number; text: string }
  | { kind: "invalid"; index: number; length: number; raw: string };

const DASH = "[-–—]";
const TOKEN_RE = new RegExp(
  [
    // "D [Month] [YYYY] - D Month YYYY"  (start month/year optional: "17 - 18 February 2026")
    `(?<![\\d])(?<d1>\\d{1,2})(?:\\s+(?<m1>${MONTH_PATTERN})\\b)?(?:\\s+(?<y1>\\d{4})\\b)?\\s*${DASH}\\s*(?<d2>\\d{1,2})\\s+(?<m2>${MONTH_PATTERN})\\b\\s+(?<y2>\\d{4})\\b`,
    // "D Month YYYY"
    `(?<![\\d])(?<sd>\\d{1,2})\\s+(?<sm>${MONTH_PATTERN})\\b\\s+(?<sy>\\d{4})\\b`,
    // "( ... )" with no nesting
    `\\((?<p>[^()]*)\\)`,
  ].join("|"),
  "gi"
);

/** Finds date ranges, single dates and parenthesised notes, in text order. */
export function scanTokens(text: string): ScanToken[] {
  const tokens: ScanToken[] = [];
  for (const m of Array.from(text.matchAll(TOKEN_RE))) {
    const g = m.groups ?? {};
    const index = m.index ?? 0;
    const length = m[0].length;
    if (g.p !== undefined) {
      tokens.push({ kind: "paren", index, length, text: g.p.trim() });
    } else if (g.sd !== undefined) {
      const d = Number(g.sd);
      const mo = monthNumber(g.sm);
      const y = Number(g.sy);
      if (!isRealDate(y, mo, d)) {
        tokens.push({ kind: "invalid", index, length, raw: m[0] });
      } else {
        const iso = toIso(y, mo, d);
        tokens.push({ kind: "single", index, length, start: iso, end: iso });
      }
    } else {
      const d2 = Number(g.d2);
      const m2 = monthNumber(g.m2);
      const y2 = Number(g.y2);
      const d1 = Number(g.d1);
      const m1 = g.m1 ? monthNumber(g.m1) : m2;
      // "21 December - 4 January 2027": no start year, start month later in the
      // year than the end month -> the range crosses a year boundary.
      const y1 = g.y1 ? Number(g.y1) : m1 > m2 ? y2 - 1 : y2;
      if (!isRealDate(y1, m1, d1) || !isRealDate(y2, m2, d2)) {
        tokens.push({ kind: "invalid", index, length, raw: m[0] });
      } else {
        tokens.push({ kind: "range", index, length, start: toIso(y1, m1, d1), end: toIso(y2, m2, d2) });
      }
    }
  }
  return tokens;
}

/** Text left over once the given tokens, "and", commas and spaces are removed. */
export function leftoverText(text: string, tokens: ScanToken[]): string {
  let out = "";
  let pos = 0;
  for (const t of tokens) {
    out += text.slice(pos, t.index) + " ";
    pos = t.index + t.length;
  }
  out += text.slice(pos);
  return out.replace(/\band\b/gi, " ").replace(/[,;&]/g, " ").replace(/\s+/g, " ").trim();
}
