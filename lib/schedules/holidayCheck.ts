import { cleanText } from "./text";

// Advisory cross-check of the document's public holidays against Calendarific. Pure: the
// caller fetches the list. Nothing here ticks, unticks or edits a row.

export type HolidayCheckKind = "match" | "date-differs" | "not-found" | "n/a";

export interface CalHoliday {
  date: string; // yyyy-MM-dd (a trailing time is ignored)
  name: string;
}

export interface HolidayCheckRow {
  rowId: string;
  result: HolidayCheckKind;
  calendarificName?: string;
  calendarificDate?: string;
  detail: string;
}

export interface NotInDocumentHoliday {
  date: string;
  name: string;
}

export interface HolidayCheckSuccess {
  status: "ok";
  source: "Calendarific";
  rows: HolidayCheckRow[];
  notInDocument: NotInDocumentHoliday[];
}

export interface HolidayCheckUnavailable {
  status: "unavailable";
  source: "Calendarific";
  message: string;
}

export type HolidayCheck = HolidayCheckSuccess | HolidayCheckUnavailable;

export interface PlannedHolidayInput {
  rowId: string;
  name: string;
  /** yyyy-MM-dd */
  start: string;
}

// How far (days) a same-named Calendarific holiday may sit from the planned date and still be
// reported as "date differs" rather than "not found". Moon-sighting holidays move by a day or two.
const NEAR_DAYS = 31;

const IN_LIEU_RE = /\(\s*(?:in-lieu|off-in-lieu|observed)\s*\)/i;

// Equivalent names share one key. Matched against the lowercased name with apostrophes,
// parentheses and hyphens removed. Order matters: "chinese new year" before "new year's day".
const ALIASES: Array<[key: string, re: RegExp]> = [
  ["chinese-new-year", /\b(?:chinese|lunar) new year\b/],
  ["new-years-day", /^new years? day$/],
  ["hari-raya-puasa", /\bhari raya (?:puasa|aidilfitri)\b|\beid (?:al |ul )?fitr\b/],
  ["hari-raya-haji", /\bhari raya (?:haji|aidiladha)\b|\beid (?:al |ul )?adha\b/],
  ["vesak", /\b(?:vesak|wesak)\b/],
  ["deepavali", /\b(?:deepavali|diwali)\b/],
  ["good-friday", /\bgood friday\b/],
  ["labour-day", /\b(?:labou?r day|may day)\b/],
  ["national-day", /\bnational day\b/],
  ["christmas", /^christmas(?: day)?$/],
];

function plain(name: string): string {
  return cleanText(name)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Equivalence key for a holiday name; unknown names fall back to their plain text. */
export function holidayKey(name: string): string {
  const p = plain(name);
  for (const [key, re] of ALIASES) if (re.test(p)) return key;
  return p;
}

const isInLieu = (name: string) => IN_LIEU_RE.test(name);

function dayNumber(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const ymd = (d: string) => d.slice(0, 10);
const yearOf = (d: string) => Number(d.slice(0, 4));

export interface CheckOptions {
  /** Years the Calendarific list covers; a planned holiday in another year is "n/a". */
  loadedYears: number[];
  /** Only Calendarific holidays in this year are listed as missing from the document. */
  listYear: number | null;
}

export function checkHolidays(
  planned: PlannedHolidayInput[],
  calendarific: CalHoliday[],
  opts: CheckOptions
): { rows: HolidayCheckRow[]; notInDocument: NotInDocumentHoliday[] } {
  const cal = calendarific.map((c) => ({ date: ymd(c.date), name: cleanText(c.name).slice(0, 120), key: holidayKey(c.name) }));
  const covered = new Set<number>();
  const loaded = new Set(opts.loadedYears);

  const rows = planned.map((p): HolidayCheckRow => {
    const date = ymd(p.start);
    const row = (result: HolidayCheckKind, detail: string, c?: { name: string; date: string }): HolidayCheckRow => ({
      rowId: p.rowId,
      result,
      detail,
      ...(c ? { calendarificName: c.name, calendarificDate: c.date } : {}),
    });

    if (!loaded.has(yearOf(date))) return row("n/a", `Not checked: Calendarific's ${yearOf(date)} list was not available.`);

    const key = holidayKey(p.name);
    const onDate = cal.map((c, i) => ({ c, i })).filter(({ c }) => c.date === date);
    const exact = onDate.find(({ c }) => c.key === key);
    if (exact) {
      covered.add(exact.i);
      return row("match", `Calendarific lists ${exact.c.name} on this date.`, exact.c);
    }

    // Singapore's observed Mondays appear in Calendarific only sometimes, so a missing one is not a problem.
    if (isInLieu(p.name)) {
      return row("n/a", "Observed day. Calendarific does not list it, so it is not checked; the holiday itself is checked on its own row.");
    }

    const nearest = cal
      .map((c, i) => ({ c, i, gap: Math.abs(dayNumber(c.date) - dayNumber(date)) }))
      .filter((x) => x.c.key === key && x.gap <= NEAR_DAYS)
      .sort((a, b) => a.gap - b.gap)[0];
    if (nearest) {
      covered.add(nearest.i);
      const moon = key === "hari-raya-puasa" || key === "hari-raya-haji" ? " Moon-sighting holidays can move; check the official announcement." : "";
      return row("date-differs", `Calendarific lists ${nearest.c.name} on ${nearest.c.date}, not ${date}.${moon}`, nearest.c);
    }

    if (onDate.length > 0) {
      const o = onDate[0].c;
      return row("not-found", `No holiday with this name in Calendarific. It lists ${o.name} on this date instead.`, o);
    }
    return row("not-found", "No matching public holiday found in Calendarific near this date.");
  });

  const notInDocument = cal
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => !covered.has(i) && (opts.listYear === null || yearOf(c.date) === opts.listYear))
    .filter(({ c }) => !planned.some((p) => ymd(p.start) === c.date && (isInLieu(p.name) || holidayKey(p.name) === c.key)))
    .map(({ c }) => ({ date: c.date, name: c.name }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { rows, notInDocument };
}

export function summarizeHolidayCheck(rows: HolidayCheckRow[]): { match: number; differ: number; notFound: number; notChecked: number } {
  const n = (k: HolidayCheckKind) => rows.filter((r) => r.result === k).length;
  return { match: n("match"), differ: n("date-differs"), notFound: n("not-found"), notChecked: n("n/a") };
}

/** "Holiday check (Calendarific): 11 match, 2 differ, 1 not found" (plus "N not checked" when any). */
export function summaryLine(rows: HolidayCheckRow[]): string {
  const s = summarizeHolidayCheck(rows);
  const parts = [`${s.match} match`, `${s.differ} differ`, `${s.notFound} not found`];
  if (s.notChecked) parts.push(`${s.notChecked} not checked`);
  return `Holiday check (Calendarific): ${parts.join(", ")}`;
}

/** Short text for the copy-for-web-check list. */
export function copyText(r: HolidayCheckRow | undefined): string {
  if (!r) return "";
  switch (r.result) {
    case "match":
      return "Calendarific: match";
    case "date-differs":
      return `Calendarific: differs (${r.calendarificName ?? "?"} on ${r.calendarificDate ?? "?"})`;
    case "not-found":
      return "Calendarific: not found";
    default:
      return "Calendarific: not checked";
  }
}
