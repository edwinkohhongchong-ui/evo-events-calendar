import type { HolidayRow, SeasonRow } from "../types";
import { daysBetween, overlapDays, yearOf } from "./dateText";
import { normaliseKeyName, PlannedHoliday, PlannedSchedule, PlannedSeason } from "./classify";

// Nothing here writes anything. The result is shown to the user for approval
// (stage 2); existing rows the document does not mention are only reported.

export type DiffStatus = "new" | "changed" | "unchanged";

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface HolidayDiff {
  status: DiffStatus;
  planned: PlannedHoliday;
  existing?: HolidayRow;
  changes: FieldChange[];
  /** Unmatched existing holidays on the same date under a different name. */
  possibleDuplicates: HolidayRow[];
}

export interface SeasonDiff {
  status: DiffStatus;
  planned: PlannedSeason;
  existing?: SeasonRow;
  changes: FieldChange[];
  /** The planned notes differ from the existing notes (does not make a row "changed"). */
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

const baseName = (n: string) => normaliseKeyName(n).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

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

function changeList(pairs: Array<[string, string, string]>): FieldChange[] {
  return pairs.filter(([, from, to]) => from !== to).map(([field, from, to]) => ({ field, from, to }));
}

function diffHolidays(planned: PlannedHoliday[], existing: HolidayRow[]): HolidayDiff[] {
  const claimed = new Set<string>();
  const match = new Map<number, HolidayRow>();

  // Pass 1: same date and compatible name. Pass 2: compatible name, same year, nearest date.
  planned.forEach((p, i) => {
    const hit = existing.find(
      (e) => !claimed.has(e.id) && e.holiday_date === p.date && holidayNamesCompatible(e.name, p.name)
    );
    if (hit) {
      claimed.add(hit.id);
      match.set(i, hit);
    }
  });
  planned.forEach((p, i) => {
    if (match.has(i)) return;
    const hits = existing
      .filter(
        (e) =>
          !claimed.has(e.id) &&
          yearOf(e.holiday_date) === yearOf(p.date) &&
          holidayNamesCompatible(e.name, p.name)
      )
      .sort((a, b) => Math.abs(daysBetween(p.date, a.holiday_date)) - Math.abs(daysBetween(p.date, b.holiday_date)));
    if (hits[0]) {
      claimed.add(hits[0].id);
      match.set(i, hits[0]);
    }
  });

  return planned.map((p, i) => {
    const e = match.get(i);
    if (!e) {
      return {
        status: "new" as const,
        planned: p,
        changes: [],
        possibleDuplicates: existing.filter((x) => !claimed.has(x.id) && x.holiday_date === p.date),
      };
    }
    const changes = changeList([
      ["date", e.holiday_date, p.date],
      ["name", e.name, p.name],
      ["type", e.type, p.type],
    ]);
    return {
      status: changes.length ? ("changed" as const) : ("unchanged" as const),
      planned: p,
      existing: e,
      changes,
      possibleDuplicates: [],
    };
  });
}

function diffSeasons(planned: PlannedSeason[], existing: SeasonRow[]): SeasonDiff[] {
  const claimed = new Set<string>();
  const match = new Map<number, SeasonRow>();
  const sameName = (e: SeasonRow, p: PlannedSeason) =>
    e.category === p.category && normaliseKeyName(e.name) === normaliseKeyName(p.name);
  const claim = (i: number, e: SeasonRow) => {
    claimed.add(e.id);
    match.set(i, e);
  };
  const ov = (e: SeasonRow, p: PlannedSeason) => overlapDays(e.start_date, e.end_date, p.start_date, p.end_date);

  // Pass 0: identical name and dates. Pass 1: same name, overlapping dates (best overlap).
  // Pass 2: same name, same year, no overlap (a moved date). Pass 3: same name apart from
  // a bracketed qualifier (e.g. "Poly Holidays (approx.)" vs "Poly Holidays (SP)") and overlapping.
  planned.forEach((p, i) => {
    const e = existing.find(
      (x) => !claimed.has(x.id) && sameName(x, p) && x.start_date === p.start_date && x.end_date === p.end_date
    );
    if (e) claim(i, e);
  });
  const bestBy = (i: number, p: PlannedSeason, ok: (e: SeasonRow) => boolean, score: (e: SeasonRow) => number) => {
    if (match.has(i)) return;
    const hits = existing.filter((e) => !claimed.has(e.id) && ok(e)).sort((a, b) => score(b) - score(a));
    if (hits[0]) claim(i, hits[0]);
  };
  planned.forEach((p, i) => bestBy(i, p, (e) => sameName(e, p) && ov(e, p) > 0, (e) => ov(e, p)));
  planned.forEach((p, i) =>
    bestBy(
      i,
      p,
      (e) => sameName(e, p) && yearOf(e.start_date) === yearOf(p.start_date),
      (e) => -Math.abs(daysBetween(p.start_date, e.start_date))
    )
  );
  planned.forEach((p, i) =>
    bestBy(
      i,
      p,
      (e) => e.category === p.category && baseName(e.name) === baseName(p.name) && ov(e, p) > 0,
      (e) => ov(e, p)
    )
  );

  return planned.map((p, i) => {
    const e = match.get(i);
    if (!e) {
      return {
        status: "new" as const,
        planned: p,
        changes: [],
        notesDiffer: false,
        possibleDuplicates: existing.filter((x) => !claimed.has(x.id) && x.category === p.category && ov(x, p) > 0),
      };
    }
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
      changes,
      notesDiffer: !!p.notes && p.notes !== (e.notes ?? ""),
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
