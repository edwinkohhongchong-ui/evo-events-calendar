import { suggestSeasonColor } from "../seasonColor";
import { applyTitlePrefix, type PastoralFocus } from "../pastoralFocus";
import { addDays } from "../schedules/dateText";
import { normaliseKeyName } from "../schedules/classify";
import { computeDuration } from "../timeMath";
import type { ColorValue, EventType, GatheringType, HolidayType, SeasonCategory } from "../types";
import type { ExcelFlag, ExcelFlagCode, ParsedEvent, ParsedWorkbook, SourceRef } from "./parseCalendarSheets";

// Turns the parser's raw items into rows shaped like the app's own (events,
// seasons, holidays, checklist), each with a stable key, flags and a default
// tick. No DB access: levels stay plain strings for the later stage to validate
// against the levels table. Record shapes follow lib/schedules/classify.ts so the
// preview can share code with the Word importer.

export type PlanFlagCode = ExcelFlagCode | "level-unknown" | "gathering-type-unknown" | "season-category-unknown" | "known-public-holiday";

export interface PlanFlag {
  code: PlanFlagCode;
  severity: "warn" | "error";
  message: string;
}

export interface PlannedBase {
  /** Stable identity for diffing, e.g. 'event|2026-03-01|19:00:00|y: qt'. Unique within a result. */
  key: string;
  source: SourceRef;
  flags: PlanFlag[];
  /** An error-severity flag is present: cannot be applied until edited. */
  invalid: boolean;
  /** Whether the preview ticks this row at first. */
  defaultSelected: boolean;
}

export interface PlannedEvent extends PlannedBase {
  kind: "event";
  /** The name as stored: title prefix in the app's 'Y: ' form. */
  name: string;
  /** The name exactly as the cell had it (first line). */
  originalName: string;
  date: string;
  event_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  /** '' when it could not be decided; the preview asks. */
  level: string;
  event_type: EventType;
  gathering_type: GatheringType | null;
  preacher_name: string | null;
  pastoral_youth: boolean;
  pastoral_poly: boolean;
  pastoral_uni: boolean;
  pastoral_adults: boolean;
  recurring: "None";
  notes: string;
}

export interface PlannedSeason extends PlannedBase {
  kind: "season";
  name: string;
  category: SeasonCategory;
  start_date: string;
  end_date: string;
  notes: string;
  color: ColorValue;
}

export interface PlannedHoliday extends PlannedBase {
  kind: "holiday";
  date: string;
  name: string;
  type: HolidayType;
  /** The name matches a Singapore public holiday, which the schedule importer already maintains: the diff should skip it. */
  knownPublicHoliday: boolean;
}

export interface PlannedChecklist extends PlannedBase {
  kind: "checklist";
  category: string;
  item: string;
  status: "Done" | "Not Started";
  target_month: null;
  notes: string;
}

export interface ClassifiedExcel {
  docYear: number | null;
  events: PlannedEvent[];
  seasons: PlannedSeason[];
  holidays: PlannedHoliday[];
  checklist: PlannedChecklist[];
  /** Copies of a neighbouring month's rows (the grid shows a few days either side) that were dropped. */
  duplicatesDropped: number;
}

const flag = (code: PlanFlagCode, severity: "warn" | "error", message: string): PlanFlag => ({ code, severity, message });
const hasError = (flags: PlanFlag[]) => flags.some((f) => f.severity === "error");
const has = (flags: PlanFlag[], code: PlanFlagCode) => flags.some((f) => f.code === code);
const asPlanFlags = (flags: ExcelFlag[]): PlanFlag[] => flags.map((f) => ({ ...f }));

function uniqueFlags(flags: PlanFlag[]): PlanFlag[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.code}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Events

const PREFIX = /^([YPUA]{1,4})\s*[:.]\s*(\S[\s\S]*)$/;
const ZONE_BY_LETTER: Record<string, string> = { Y: "Youth", P: "Poly", U: "Uni", A: "Adults" };
const GATHERING_PLAIN = /^gathering(?:\s+with\s+(.+))?$/i;

function inferGatheringType(name: string): GatheringType | null {
  if (/\bbig day\b/i.test(name)) return "+EVO YTH Big Day";
  if (/\byth\b/i.test(name)) return "YTH Gathering";
  if (/\b(easter|xmas|christmas)\b/i.test(name)) return "Easter/XMAS";
  return GATHERING_PLAIN.test(name) ? "Gathering" : null;
}

interface LevelGuess {
  name: string;
  level: string;
  focus: PastoralFocus;
  eventType: EventType;
  gatheringType: GatheringType | null;
  preacher: string | null;
  flags: PlanFlag[];
}

export function guessEvent(rawName: string): LevelGuess {
  const none: PastoralFocus = { youth: false, poly: false, uni: false, adults: false };
  const base: LevelGuess = { name: rawName, level: "", focus: none, eventType: "Event", gatheringType: null, preacher: null, flags: [] };

  if (/^gathering\b/i.test(rawName)) {
    const g = inferGatheringType(rawName);
    const flags: PlanFlag[] = [];
    if (!g) flags.push(flag("gathering-type-unknown", "warn", "This is a Gathering but the type is not obvious; check the Gathering type."));
    return { ...base, level: "Gathering", eventType: "Gathering", gatheringType: g ?? "Gathering", preacher: GATHERING_PLAIN.exec(rawName)?.[1]?.trim() ?? null, flags };
  }

  const m = PREFIX.exec(rawName);
  if (m) {
    const letters = new Set(m[1].split(""));
    const focus: PastoralFocus = { youth: letters.has("Y"), poly: letters.has("P"), uni: letters.has("U"), adults: letters.has("A") };
    const name = applyTitlePrefix(m[2].trim(), focus);
    if (letters.size === 1) return { ...base, name, level: ZONE_BY_LETTER[m[1][0]], focus };
    return { ...base, name, focus, flags: [flag("level-unknown", "warn", "This event is for more than one group, so no single level was chosen; pick one.")] };
  }

  const words = (re: RegExp) => re.test(rawName);
  let level = "";
  if (words(/\+EVO\s*YTH/i) || words(/\byouth\b/i)) level = "Youth";
  else if (words(/\bTG\b/)) level = "TG";
  else if (words(/\b(COW|Thirdspace)\b/i)) level = "COW/Thirdspace";
  else {
    const poly = words(/\bpoly\b/i);
    const uni = words(/\buni\b/i);
    if (poly && uni) {
      const focus: PastoralFocus = { ...none, poly: true, uni: true };
      return { ...base, name: applyTitlePrefix(rawName, focus), focus, flags: [flag("level-unknown", "warn", "This event mentions both Poly and Uni, so no single level was chosen; pick one.")] };
    }
    if (poly) level = "Poly";
    else if (uni) level = "Uni";
  }
  if (!level) base.flags.push(flag("level-unknown", "warn", "Could not tell which level this event is for; pick one."));
  return { ...base, level };
}

function eventPlan(e: ParsedEvent): Omit<PlannedEvent, "key"> {
  const g = guessEvent(e.name);
  const flags = uniqueFlags([...asPlanFlags(e.flags), ...g.flags]);
  const invalid = hasError(flags);
  return {
    kind: "event",
    name: g.name,
    originalName: e.name,
    date: e.date,
    event_time: e.start,
    end_time: e.end,
    duration_minutes: e.start && e.end ? computeDuration(e.start.slice(0, 5), e.end.slice(0, 5)) : null,
    level: g.level,
    event_type: g.eventType,
    gathering_type: g.gatheringType,
    preacher_name: g.preacher,
    pastoral_youth: g.focus.youth,
    pastoral_poly: g.focus.poly,
    pastoral_uni: g.focus.uni,
    pastoral_adults: g.focus.adults,
    recurring: "None",
    notes: e.details.join("\n"),
    source: e.source,
    flags,
    invalid,
    defaultSelected: isTicked(flags, invalid),
  };
}

function isTicked(flags: PlanFlag[], invalid: boolean): boolean {
  return !invalid && !has(flags, "stale-year-in-text") && !has(flags, "date-outside-month") && !has(flags, "ambiguous-week-note") && !has(flags, "known-public-holiday");
}

const baseKey = (kind: string, ...parts: string[]) => [kind, ...parts].join("|");

/** Repeats of the same key get '#2', '#3' so keys stay unique without losing stability. */
function numberDuplicates<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const n = (seen.get(r.key) ?? 0) + 1;
    seen.set(r.key, n);
    return n === 1 ? r : { ...r, key: `${r.key}#${n}` };
  });
}

// ---------------------------------------------------------------------------
// Seasons

const ACRONYMS = new Set(["RF", "LBF", "IRL", "JC", "SP", "NP", "TP", "NYP", "NUS", "NTU", "SMU", "SIM", "PSLE"]);
const MINOR = new Set(["and", "of", "the", "for", "to", "in"]);

function tidySeasonName(text: string): string {
  const stripped = text
    .replace(/\(\s*\d{1,2}\s+[A-Za-z]{3,9}\.?\s*[-–—]\s*\d{1,2}\s+[A-Za-z]{3,9}\.?\s*\)/g, " ")
    .replace(/\(\s*[A-Za-z]{3,9}\.?(?:\s+\d{4})?\s*[-–—]\s*[A-Za-z]{3,9}\.?(?:\s+\d{4})?\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = stripped || text.trim();
  if (/[a-z]/.test(name)) return name;
  return name
    .split(" ")
    .map((w, i) => {
      if (ACRONYMS.has(w)) return w;
      const lower = w.toLowerCase();
      return i > 0 && MINOR.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function seasonCategory(name: string): SeasonCategory | null {
  if (/\b(cycles?|rf|lbf|irl)\b/i.test(name)) return "Ministry Season";
  if (/\bexam/i.test(name)) return "Exam Period";
  if (/\b(holidays?|vacation|school|term|recess)\b/i.test(name)) return "School Schedule";
  return null;
}

function planSeasons(parsed: ParsedWorkbook): PlannedSeason[] {
  const raw: PlannedSeason[] = [];
  for (const m of parsed.months) {
    for (const s of m.seasons) {
      const name = tidySeasonName(s.text);
      const cat = seasonCategory(name);
      const flags = asPlanFlags(s.flags);
      if (!cat) flags.push(flag("season-category-unknown", "warn", "Could not tell what kind of season this is; it is set to Other."));
      const invalid = hasError(flags);
      raw.push({
        kind: "season",
        name,
        category: cat ?? "Other",
        start_date: s.start,
        end_date: s.end,
        notes: "",
        color: suggestSeasonColor(name),
        key: "",
        source: s.source,
        flags,
        invalid,
        defaultSelected: !invalid && !has(flags, "stale-year-in-text"),
      });
    }
  }
  // The same tag shows on neighbouring sheets (overlapping weeks): join overlapping or touching spans.
  const groups = new Map<string, PlannedSeason[]>();
  for (const s of raw) {
    const k = `${normaliseKeyName(s.name)}|${s.category}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: PlannedSeason[] = [];
  for (const group of Array.from(groups.values())) {
    group.sort((a, b) => a.start_date.localeCompare(b.start_date));
    const joined: PlannedSeason[] = [];
    for (const s of group) {
      const prev = joined[joined.length - 1];
      if (prev && s.start_date <= addDays(prev.end_date, 1)) {
        if (s.end_date > prev.end_date) prev.end_date = s.end_date;
        prev.flags = uniqueFlags([...prev.flags, ...s.flags]);
        prev.invalid = hasError(prev.flags);
        prev.defaultSelected = prev.defaultSelected && s.defaultSelected;
      } else joined.push({ ...s, flags: [...s.flags] });
    }
    out.push(...joined);
  }
  out.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));
  return numberDuplicates(out.map((s) => ({ ...s, key: baseKey("season", normaliseKeyName(s.name), s.category, s.start_date, s.end_date) })));
}

// ---------------------------------------------------------------------------
// Holidays (observances)

const SG_PUBLIC_HOLIDAYS = [
  "new year's day", "new year", "chinese new year", "good friday", "hari raya puasa", "hari raya haji", "labour day", "vesak day",
  "national day", "deepavali", "christmas day", "christmas", "polling day",
];

function isKnownPublicHoliday(name: string): boolean {
  const n = normaliseKeyName(name).replace(/\s*\((?:day \d+|in-lieu)\)\s*/g, "").trim();
  return SG_PUBLIC_HOLIDAYS.includes(n);
}

// ---------------------------------------------------------------------------

export function classifyWorkbook(parsed: ParsedWorkbook): ClassifiedExcel {
  let duplicatesDropped = 0;

  // Events: rows from the sheet's own month first; the few days of a neighbouring month shown on the grid
  // are dropped when that month's own sheet already has them.
  const inside: Array<Omit<PlannedEvent, "key">> = [];
  const outside: Array<Omit<PlannedEvent, "key">> = [];
  for (const m of parsed.months) {
    for (const e of m.events) {
      const p = eventPlan(e);
      (has(p.flags, "date-outside-month") ? outside : inside).push(p);
    }
  }
  const evKey = (e: Omit<PlannedEvent, "key">) => baseKey("event", e.date, e.event_time ?? "", normaliseKeyName(e.name));
  const events: PlannedEvent[] = numberDuplicates(inside.map((e) => ({ ...e, key: evKey(e) })));
  const known = new Set(events.map((e) => e.key.replace(/#\d+$/, "")));
  for (const e of outside) {
    const k = evKey(e);
    if (known.has(k)) duplicatesDropped++;
    else {
      known.add(k);
      events.push({ ...e, key: k });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.event_time ?? "").localeCompare(b.event_time ?? "") || a.key.localeCompare(b.key));

  // Observances.
  const holidays: PlannedHoliday[] = [];
  const seen = new Set<string>();
  const ordered = parsed.months.flatMap((m) => m.observances.map((o) => ({ o, outside: o.flags.some((f) => f.message.includes("outside")) })));
  ordered.sort((a, b) => Number(a.outside) - Number(b.outside));
  for (const { o } of ordered) {
    const key = baseKey("holiday", normaliseKeyName(o.name), o.date, o.date);
    if (seen.has(key)) {
      duplicatesDropped++;
      continue;
    }
    seen.add(key);
    const flags = asPlanFlags(o.flags);
    const knownPh = isKnownPublicHoliday(o.name);
    if (knownPh) flags.push(flag("known-public-holiday", "warn", "This looks like a Singapore public holiday, which the schedule importer already keeps up to date; it will be skipped."));
    const invalid = hasError(flags);
    holidays.push({
      kind: "holiday",
      date: o.date,
      name: o.name,
      type: "International Observance",
      knownPublicHoliday: knownPh,
      key,
      source: o.source,
      flags,
      invalid,
      defaultSelected: isTicked(flags, invalid),
    });
  }
  holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const checklist: PlannedChecklist[] = numberDuplicates(
    parsed.checklist.map((c) => {
      const flags = asPlanFlags(c.flags);
      const invalid = hasError(flags);
      return {
        kind: "checklist" as const,
        category: c.section,
        item: c.item,
        status: c.done ? ("Done" as const) : ("Not Started" as const),
        target_month: null,
        notes: c.subitems.join("; "),
        key: baseKey("checklist", normaliseKeyName(c.section), normaliseKeyName(c.item)),
        source: c.source,
        flags,
        invalid,
        defaultSelected: !invalid,
      };
    })
  );

  return { docYear: parsed.year, events, seasons: planSeasons(parsed), holidays, checklist, duplicatesDropped };
}
