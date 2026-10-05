import type { HolidayRow, HolidayType, SeasonCategory, SeasonRow } from "../types";
import { daysBetween, overlapDays, yearOf } from "./dateText";
import { normaliseKeyName, PlannedHoliday, PlannedSchedule, PlannedSeason } from "./classify";

// Nothing here writes anything. The result is shown to the user for approval
// (stage 2); existing rows the document does not mention are only reported.

export type DiffStatus = "new" | "changed" | "unchanged";

/**
 * How an existing row was paired with a document row, strongest first.
 * exact: same name and same dates. overlap: same name and substantially the same dates
 * (same start or end, or each range mostly inside the other); a looser overlap is 'name-year'.
 * name-year: same name and year, dates moved (at most MAX_SHIFT_DAYS, only one candidate).
 * qualifier: same date/name apart from a tentative/approx/observed qualifier or a longer trailing name.
 * Only exact and overlap are safe to pre-tick; the others need a human to confirm it is the same row.
 */
export type MatchKind = "exact" | "overlap" | "name-year" | "qualifier";

export const isStrongMatch = (k: MatchKind | null | undefined): boolean => k === "exact" || k === "overlap";

/** A moved row may start at most this many days from the one it replaces. */
export const MAX_SHIFT_DAYS = 45;

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

/** What the matcher reads from a planned holiday/season, so the Excel importer can reuse it. */
export interface HolidayLike {
  date: string;
  name: string;
  type: HolidayType;
}
export interface SeasonLike {
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string;
}

export interface HolidayDiff<P extends HolidayLike = PlannedHoliday> {
  status: DiffStatus;
  planned: P;
  existing?: HolidayRow;
  matchKind?: MatchKind;
  changes: FieldChange[];
  /** Unmatched existing holidays on the same date under a different name. */
  possibleDuplicates: HolidayRow[];
}

export interface SeasonDiff<P extends SeasonLike = PlannedSeason> {
  status: DiffStatus;
  planned: P;
  existing?: SeasonRow;
  matchKind?: MatchKind;
  changes: FieldChange[];
  /** The document's note is not already in the existing notes (does not make a row "changed" by itself). */
  notesDiffer: boolean;
  /** Unmatched existing seasons in the same category with overlapping dates under a different name. */
  possibleDuplicates: SeasonRow[];
}

export interface ExistingData {
  holidays: HolidayRow[];
  seasons: SeasonRow[];
}

export interface ScheduleDiff {
  holidays: HolidayDiff[];
  seasons: SeasonDiff[];
  /** Existing rows in the document's scope and year that the document does not mention. Informational only. */
  missingFromDocument: { holidays: HolidayRow[]; seasons: SeasonRow[] };
  summary: {
    holidays: Record<DiffStatus, number>;
    seasons: Record<DiffStatus, number>;
    missingHolidays: number;
    missingSeasons: number;
  };
}

const IN_SCOPE_HOLIDAY_TYPES = new Set([
  "National (SG Public Holiday)",
  "National (SG Public Holiday, provisional)",
]);
const IN_SCOPE_SEASON_CATEGORIES = new Set(["School Schedule", "Exam Period"]);

const sameRawName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Same holiday, allowing a trailing qualifier on one side ("... / Ash Wednesday"),
 *  but never letting a day match its own in-lieu day. */
function holidayNamesCompatible(a: string, b: string): boolean {
  const x = normaliseKeyName(a);
  const y = normaliseKeyName(b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!long.startsWith(short)) return false;
  const tail = long.slice(short.length);
  return !/in-lieu|off-in-lieu/.test(tail) && /^[\s(/]/.test(tail);
}

export function changeList(pairs: Array<[string, string, string]>): FieldChange[] {
  return pairs.filter(([, from, to]) => from !== to).map(([field, from, to]) => ({ field, from, to }));
}

export function diffHolidays<P extends HolidayLike>(planned: P[], existing: HolidayRow[]): HolidayDiff<P>[] {
  const claimed = new Set<string>();
  const match = new Map<number, { row: HolidayRow; kind: MatchKind }>();

  // Pass 1: same date and compatible name. Pass 2: compatible name, same year, date moved by
  // at most MAX_SHIFT_DAYS, and only one such row (otherwise it is a guess, so no match).
  planned.forEach((p, i) => {
    const hit = existing.find(
      (e) => !claimed.has(e.id) && e.holiday_date === p.date && holidayNamesCompatible(e.name, p.name)
    );
    if (hit) {
      claimed.add(hit.id);
      match.set(i, { row: hit, kind: normaliseKeyName(hit.name) === normaliseKeyName(p.name) ? "exact" : "qualifier" });
    }
  });
  planned.forEach((p, i) => {
    if (match.has(i)) return;
    const hits = existing.filter(
      (e) =>
        !claimed.has(e.id) &&
        yearOf(e.holiday_date) === yearOf(p.date) &&
        Math.abs(daysBetween(p.date, e.holiday_date)) <= MAX_SHIFT_DAYS &&
        holidayNamesCompatible(e.name, p.name)
    );
    if (hits.length === 1) {
      claimed.add(hits[0].id);
      match.set(i, { row: hits[0], kind: "name-year" });
    }
  });

  return planned.map((p, i) => {
    const m = match.get(i);
    if (!m) {
      return {
        status: "new" as const,
        planned: p,
        changes: [],
        possibleDuplicates: existing.filter((x) => !claimed.has(x.id) && x.holiday_date === p.date),
      };
    }
    const e = m.row;
    const changes = changeList([
      ["date", e.holiday_date, p.date],
      ["name", e.name, p.name],
      ["type", e.type, p.type],
    ]);
    return {
      status: changes.length ? ("changed" as const) : ("unchanged" as const),
      planned: p,
      existing: e,
      matchKind: m.kind,
      changes,
      possibleDuplicates: [],
    };
  });
}

export function diffSeasons<P extends SeasonLike>(planned: P[], existing: SeasonRow[]): SeasonDiff<P>[] {
  const claimed = new Set<string>();
  const match = new Map<number, { row: SeasonRow; kind: MatchKind }>();
  const sameName = (e: SeasonRow, p: P) =>
    e.category === p.category && normaliseKeyName(e.name) === normaliseKeyName(p.name);
  const claim = (i: number, e: SeasonRow, strong: MatchKind) => {
    claimed.add(e.id);
    // Names equal only after dropping a tentative/approx qualifier: still a name change to confirm.
    match.set(i, { row: e, kind: sameRawName(e.name, planned[i].name) ? strong : "qualifier" });
  };
  const ov = (e: SeasonRow, p: P) => overlapDays(e.start_date, e.end_date, p.start_date, p.end_date);

  // Names are compared with normaliseKeyName only: it drops "(tentative)", "(approx.)" and
  // observed markers, and nothing else. Institution codes ("(SP)" vs "(RP)") and month labels
  // ("(March)" vs "(June)") are part of the identity and are never stripped, so different
  // rows can never be paired through their names.
  // Pass 0: identical name and dates. Pass 1: same name, overlapping dates, assigned globally
  // best-first (an earlier document row cannot steal an existing row that suits a later one better).
  // Pass 2: same name and year, moved by at most MAX_SHIFT_DAYS, with exactly one candidate.
  planned.forEach((p, i) => {
    const e = existing.find(
      (x) => !claimed.has(x.id) && sameName(x, p) && x.start_date === p.start_date && x.end_date === p.end_date
    );
    if (e) claim(i, e, "exact");
  });
  const len = (start: string, end: string) => daysBetween(start, end) + 1;
  const candidates: Array<{ i: number; e: SeasonRow; ratio: number; shift: number; strong: boolean }> = [];
  planned.forEach((p, i) => {
    if (match.has(i)) return;
    for (const e of existing) {
      if (claimed.has(e.id) || !sameName(e, p)) continue;
      const days = ov(e, p);
      if (days <= 0) continue;
      const lp = len(p.start_date, p.end_date);
      const le = len(e.start_date, e.end_date);
      candidates.push({
        i,
        e,
        ratio: days / Math.max(lp, le),
        shift: Math.abs(daysBetween(p.start_date, e.start_date)),
        // Same start or end, or each range mostly inside the other. Anything looser is a guess
        // (a long holiday block containing a short document stub), so it is matched weakly.
        strong: e.start_date === p.start_date || e.end_date === p.end_date || (days * 2 >= lp && days * 2 >= le),
      });
    }
  });
  candidates.sort((a, b) => b.ratio - a.ratio || a.shift - b.shift || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0) || a.i - b.i);
  for (const c of candidates) {
    if (match.has(c.i) || claimed.has(c.e.id)) continue;
    claim(c.i, c.e, c.strong ? "overlap" : "name-year");
  }
  planned.forEach((p, i) => {
    if (match.has(i)) return;
    const hits = existing.filter(
      (e) =>
        !claimed.has(e.id) &&
        sameName(e, p) &&
        yearOf(e.start_date) === yearOf(p.start_date) &&
        Math.abs(daysBetween(p.start_date, e.start_date)) <= MAX_SHIFT_DAYS
    );
    if (hits.length === 1) {
      claimed.add(hits[0].id);
      match.set(i, { row: hits[0], kind: "name-year" });
    }
  });

  return planned.map((p, i) => {
    const m = match.get(i);
    if (!m) {
      return {
        status: "new" as const,
        planned: p,
        changes: [],
        notesDiffer: false,
        // Same category and overlapping dates, or the same name in the same year (a moved or
        // ambiguous row we declined to pick): worth a look before adding another.
        possibleDuplicates: existing.filter(
          (x) =>
            !claimed.has(x.id) &&
            x.category === p.category &&
            (ov(x, p) > 0 || (sameName(x, p) && yearOf(x.start_date) === yearOf(p.start_date)))
        ),
      };
    }
    const e = m.row;
    const changes = changeList([
      ["name", e.name, p.name],
      ["category", e.category, p.category],
      ["start_date", e.start_date, p.start_date],
      ["end_date", e.end_date, p.end_date],
    ]);
    return {
      status: changes.length ? ("changed" as const) : ("unchanged" as const),
      planned: p,
      existing: e,
      matchKind: m.kind,
      changes,
      notesDiffer: !!p.notes && !(e.notes ?? "").includes(p.notes),
      possibleDuplicates: [],
    };
  });
}

function count(items: Array<{ status: DiffStatus }>): Record<DiffStatus, number> {
  const out: Record<DiffStatus, number> = { new: 0, changed: 0, unchanged: 0 };
  for (const i of items) out[i.status]++;
  return out;
}

export function planDiff(planned: PlannedSchedule, existing: ExistingData): ScheduleDiff {
  const holidays = diffHolidays(planned.holidays, existing.holidays);
  const seasons = diffSeasons(planned.seasons, existing.seasons);

  const year = planned.docYear;
  const matchedHolidayIds = new Set(holidays.flatMap((h) => (h.existing ? [h.existing.id] : [])));
  const matchedSeasonIds = new Set(seasons.flatMap((s) => (s.existing ? [s.existing.id] : [])));
  const yearStart = year === null ? "" : `${year}-01-01`;
  const yearEnd = year === null ? "" : `${year}-12-31`;

  const missingHolidays =
    year === null
      ? []
      : existing.holidays.filter(
          (h) =>
            !matchedHolidayIds.has(h.id) &&
            IN_SCOPE_HOLIDAY_TYPES.has(h.type) &&
            h.holiday_date >= yearStart &&
            h.holiday_date <= yearEnd
        );
  const missingSeasons =
    year === null
      ? []
      : existing.seasons.filter(
          (s) =>
            !matchedSeasonIds.has(s.id) &&
            IN_SCOPE_SEASON_CATEGORIES.has(s.category) &&
            s.start_date <= yearEnd &&
            s.end_date >= yearStart
        );

  return {
    holidays,
    seasons,
    missingFromDocument: { holidays: missingHolidays, seasons: missingSeasons },
    summary: {
      holidays: count(holidays),
      seasons: count(seasons),
      missingHolidays: missingHolidays.length,
      missingSeasons: missingSeasons.length,
    },
  };
}
