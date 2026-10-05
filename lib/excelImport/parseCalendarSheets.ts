import { MAX_YEAR, MIN_YEAR } from "../dates";
import { addDays, dayOfWeek, daysBetween, isRealDate, monthNumber, toIso } from "../schedules/dateText";
import { cleanNotes, cleanText } from "../schedules/text";
import { cellText, colToIndex, getCell, indexToCol } from "./readXlsx";
import type { XlsxSheet, XlsxWorkbook } from "./readXlsx";

// Layout parser for the old Excel events calendar. Pure: no I/O. Columns A-O of a
// month sheet are the Microsoft template's junk (mini calendars, formulas); only the
// grid in P..V is read. Every item carries where it came from and plain-language flags
// so the later preview can show the reviewer exactly what needs a look.

export type ExcelFlagCode =
  | "no-time"
  | "no-name"
  | "multi-event-cell"
  | "ambiguous-week-note"
  | "season-no-dates"
  | "season-date-mismatch"
  | "stale-year-in-text"
  | "date-outside-month"
  | "no-weekday-header"
  | "unknown-layout"
  | "bad-year"
  | "event-in-season-row"
  | "no-done-flag";

export interface ExcelFlag {
  code: ExcelFlagCode;
  severity: "warn" | "error";
  message: string;
}

export interface SourceRef {
  sheet: string;
  /** A1-style cell reference. */
  cell: string;
  /** The cell text, cut to 200 characters. */
  text: string;
}

export interface ParsedEvent {
  /** yyyy-MM-dd */
  date: string;
  name: string;
  /** Location / note lines that sat between the name and the time. */
  details: string[];
  /** HH:MM:SS, null when the cell had no time. */
  start: string | null;
  end: string | null;
  source: SourceRef;
  flags: ExcelFlag[];
}

export interface ParsedSeason {
  /** The tag text, whitespace collapsed. */
  text: string;
  start: string;
  end: string;
  /** True when start/end came from dates written in the tag rather than from the grid. */
  explicitDates: boolean;
  source: SourceRef;
  flags: ExcelFlag[];
}

export interface ParsedObservance {
  date: string;
  name: string;
  source: SourceRef;
  flags: ExcelFlag[];
}

export interface ParsedWeekNote {
  /** Monday and Sunday of the week. */
  weekStart: string;
  weekEnd: string;
  text: string;
  source: SourceRef;
  flags: ExcelFlag[];
}

export interface ParsedMonth {
  month: number;
  year: number;
  sheetName: string;
  events: ParsedEvent[];
  seasons: ParsedSeason[];
  observances: ParsedObservance[];
  weekNotes: ParsedWeekNote[];
}

export interface ParsedChecklistItem {
  section: string;
  /** The "NO." column, when present. */
  number: string | null;
  item: string;
  subitems: string[];
  /** null when the DONE? cell was blank or not understood. */
  done: boolean | null;
  source: SourceRef;
  flags: ExcelFlag[];
}

export interface SheetFlag extends ExcelFlag {
  source: SourceRef;
}

export interface ParsedWorkbook {
  /** The year most month sheets agree on. */
  year: number | null;
  months: ParsedMonth[];
  checklist: ParsedChecklistItem[];
  /** Sheet-level problems (no header, bad year, unfamiliar layout). */
  flags: SheetFlag[];
  ignoredSheets: string[];
}

const GRID_FIRST_COL = colToIndex("P");
const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const SOURCE_TEXT_MAX = 200;
/** Same tag in neighbouring weeks joins up when the gap between the spans is at most a weekend. */
const MAX_JOIN_GAP_DAYS = 3;

const flag = (code: ExcelFlagCode, severity: "warn" | "error", message: string): ExcelFlag => ({ code, severity, message });
const truncate = (s: string) => (s.length > SOURCE_TEXT_MAX ? s.slice(0, SOURCE_TEXT_MAX) : s);

function sourceRef(sheet: XlsxSheet, row: number, col: number): SourceRef {
  return { sheet: sheet.name, cell: `${indexToCol(col)}${row}`, text: truncate(cellText(sheet, row, col)) };
}

// ---------------------------------------------------------------------------
// Times

const hhmmss = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

interface Clock {
  h: number;
  m: number;
  /** "a" / "p" when the text said am / pm. */
  mer: "a" | "p" | null;
}

/** "19:00", "8.30pm", "8:30 am", "9pm"; a bare "9" only when allowBare. */
function parseClock(raw: string, allowBare = false): Clock | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{1,2})\s*[:.]\s*(\d{2})\s*(?:([ap])\.?m\.?)?$/.exec(s);
  if (!m) m = /^(\d{1,2})()\s*([ap])\.?m\.?$/.exec(s);
  if (!m && allowBare) m = /^(\d{1,2})()()$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = (m[3] as "a" | "p" | undefined) ?? null;
  if (min > 59 || h > 24 || (mer && (h < 1 || h > 12))) return null;
  return { h, m: min, mer };
}

function to24(c: Clock, mer: "a" | "p" | null): { h: number; m: number } {
  let h = c.h;
  if (mer === "p" && h < 12) h += 12;
  if (mer === "a" && h === 12) h = 0;
  return { h: h % 24, m: c.m };
}

export interface TimeLine {
  start: string;
  end: string | null;
}

/** A line that is only a time ("14:00") or a time range ("19:00 - 21:00", "8:30am - 9:30am"). */
export function parseTimeLine(line: string): TimeLine | null {
  line = line.replace(/\s+onwards$/i, "");
  const parts = line.trim().split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (parts.length === 1) {
    const c = parseClock(parts[0]);
    if (!c) return null;
    const t = to24(c, c.mer);
    return { start: hhmmss(t.h, t.m), end: null };
  }
  if (parts.length !== 2) return null;
  const endClock = parseClock(parts[1]);
  const startClock = parseClock(parts[0], endClock?.mer != null);
  if (!startClock || !endClock) return null;
  const end = to24(endClock, endClock.mer);
  let startMer = startClock.mer;
  if (!startMer && endClock.mer) {
    // "9 - 10pm" is 9am; "11 - 1pm" is 11am; "2 - 4pm" is 2pm.
    const asEndMer = to24(startClock, endClock.mer);
    startMer = asEndMer.h * 60 + asEndMer.m <= end.h * 60 + end.m ? endClock.mer : endClock.mer === "p" ? "a" : "p";
  }
  const start = to24(startClock, startMer);
  return { start: hhmmss(start.h, start.m), end: hhmmss(end.h, end.m) };
}

const T = String.raw`\d{1,2}(?:\s*[:.]\s*\d{2})?\s*(?:[ap]\.?m\.?)?`;
// A trailing range must close with minutes or am/pm so "Level 2 - 3" is not read as a time.
const T_END = String.raw`(?:\d{1,2}\s*[:.]\s*\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)`;
const TRAILING_RANGE = new RegExp(String.raw`^(.*?\S)\s*[:(\s]\s*(${T}\s*[-–—]\s*${T_END})\s*\)?\s*$`, "i");
const LEADING_TIME = new RegExp(String.raw`^(${T}(?:\s*[-–—]\s*${T})?)\s+(\S.*)$`, "i");

/** "Label: 10-10.30pm" or "Label (7.30-10pm)": a time range closing a text line. */
function trailingTime(line: string): { text: string; time: TimeLine } | null {
  const m = TRAILING_RANGE.exec(line);
  const t = m ? parseTimeLine(m[2]) : null;
  return m && t ? { text: m[1].replace(/[:\s]+$/, ""), time: t } : null;
}

/** "3pm Lunch with the team": a time opening a text line. */
function leadingTime(line: string): { text: string; time: TimeLine } | null {
  const m = LEADING_TIME.exec(line);
  const t = m ? parseTimeLine(m[1]) : null;
  return m && t ? { text: m[2], time: t } : null;
}

const hasTimeRange = (text: string) => text.split(/\r?\n/).some((l) => parseTimeLine(l) !== null);

// ---------------------------------------------------------------------------
// Event cells

interface RawEvent {
  name: string;
  details: string[];
  start: string | null;
  end: string | null;
}

/** Splits one grid cell into events: lines before a time line belong to that event (first line = name). */
export function splitEventCell(text: string): RawEvent[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => cleanText(l))
    .filter(Boolean);
  const out: RawEvent[] = [];
  let buf: string[] = [];
  // An event opened by a leading time ("3pm Lunch") takes the plain lines after it as its details.
  let open: RawEvent | null = null;
  for (const line of lines) {
    const t = parseTimeLine(line);
    if (t) {
      open = null;
      out.push({ name: buf[0] ?? "", details: buf.slice(1), start: t.start, end: t.end });
      buf = [];
      continue;
    }
    const trail = trailingTime(line);
    if (trail) {
      open = null;
      const lead = trail.text ? [...buf, trail.text] : buf;
      out.push({ name: lead[0] ?? "", details: lead.slice(1), start: trail.time.start, end: trail.time.end });
      buf = [];
      continue;
    }
    const lead = leadingTime(line);
    if (lead) {
      if (buf.length) out.push({ name: buf[0], details: buf.slice(1), start: null, end: null });
      buf = [];
      open = { name: lead.text, details: [], start: lead.time.start, end: lead.time.end };
      out.push(open);
      continue;
    }
    if (open) open.details.push(line);
    else buf.push(line);
  }
  if (buf.length) out.push({ name: buf[0], details: buf.slice(1), start: null, end: null });
  return out;
}

// A cell in column P without a time that reads like a list ("Weekday: ...") is the week's note.
function looksLikeWeekNote(text: string): "yes" | "maybe" | "no" {
  if (hasTimeRange(text)) return "no";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const colon = text.includes(":");
  if (colon && (lines.length > 1 || text.trim().length > 15)) return "yes";
  if (colon) return "maybe"; // "AGH:" - too short to tell a prefix from a heading
  return "no";
}

// ---------------------------------------------------------------------------
// Sheet recognition

const MONTH_SHEET = /^\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s._'-]*(\d{4}|\d{2})\s*$/i;

function parseSheetName(name: string): { month: number; year: number } | null {
  const m = MONTH_SHEET.exec(name);
  if (!m) return null;
  const yy = m[2];
  return { month: monthNumber(m[1]), year: yy.length === 2 ? 2000 + Number(yy) : Number(yy) };
}

function findHeaderRow(sheet: XlsxSheet): number | null {
  for (let r = 1; r <= sheet.maxRow; r++) {
    let ok = true;
    for (let i = 0; i < 7 && ok; i++) ok = cellText(sheet, r, GRID_FIRST_COL + i).trim().toUpperCase() === WEEKDAYS[i];
    if (ok) return r;
  }
  return null;
}

const DAY_CELL = /^[ \t]*(\d{1,2})(?:[ \t]+([\s\S]+))?$/;

function dayCell(sheet: XlsxSheet, row: number, i: number): { day: number; rest: string } | null {
  const text = cellText(sheet, row, GRID_FIRST_COL + i);
  if (!text || hasTimeRange(text)) return null;
  const m = DAY_CELL.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= 1 && day <= 31 ? { day, rest: cleanText(m[2] ?? "") } : null;
}

function isDayRow(sheet: XlsxSheet, row: number): boolean {
  let filled = 0;
  let matched = 0;
  for (let i = 0; i < 7; i++) {
    if (!cellText(sheet, row, GRID_FIRST_COL + i).trim()) continue;
    filled++;
    if (dayCell(sheet, row, i)) matched++;
  }
  return matched >= 5 && matched === filled;
}

function rowHasContent(sheet: XlsxSheet, row: number): boolean {
  for (let i = 0; i < 7; i++) if (cellText(sheet, row, GRID_FIRST_COL + i).trim()) return true;
  return false;
}

function lastContentRow(sheet: XlsxSheet, from: number, to: number): number | null {
  for (let r = to; r >= from; r--) if (rowHasContent(sheet, r)) return r;
  return null;
}

function mergeAt(sheet: XlsxSheet, row: number, col: number) {
  return sheet.merges.find((m) => m.r1 === row && m.c1 === col);
}

function inAnyMerge(sheet: XlsxSheet, row: number, col: number): boolean {
  return sheet.merges.some((m) => row >= m.r1 && row <= m.r2 && col >= m.c1 && col <= m.c2);
}

// ---------------------------------------------------------------------------
// Season tags

const collapse = (s: string) => cleanText(s);
const tagKey = (s: string) => collapse(s).toLowerCase();

const EXPLICIT_RANGE = new RegExp(
  "(\\d{1,2})\\s+([A-Za-z]{3,9})\\.?\\s*[-–—]\\s*(\\d{1,2})\\s+([A-Za-z]{3,9})",
  "i"
);
const MONTH_ONLY_RANGE = /\(\s*[A-Za-z]{3,9}\.?(?:\s+\d{4})?\s*[-–—]\s*[A-Za-z]{3,9}\.?(?:\s+\d{4})?\s*\)/;

/** "(30 NOV - 31 DEC)" -> dates, picking the year that puts the start nearest the grid span. */
function explicitDates(text: string, nearStart: string): { start: string; end: string } | null {
  const m = EXPLICIT_RANGE.exec(text);
  if (!m) return null;
  const sm = monthNumber(m[2]);
  const em = monthNumber(m[4]);
  const sd = Number(m[1]);
  const ed = Number(m[3]);
  if (!sm || !em || !m[2] || !m[4]) return null;
  // monthNumber matches by 3-letter prefix, so reject words that merely start like a month.
  if (!/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(m[2]) || !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(m[4])) return null;
  const baseYear = Number(nearStart.slice(0, 4));
  let best: { start: string; end: string } | null = null;
  let bestDist = Infinity;
  for (const y of [baseYear - 1, baseYear, baseYear + 1]) {
    if (!isRealDate(y, sm, sd)) continue;
    const start = toIso(y, sm, sd);
    const endYear = em < sm || (em === sm && ed < sd) ? y + 1 : y;
    if (!isRealDate(endYear, em, ed)) continue;
    const dist = Math.abs(daysBetween(nearStart, start));
    if (dist < bestDist) {
      bestDist = dist;
      best = { start, end: toIso(endYear, em, ed) };
    }
  }
  return best;
}

interface SeasonPiece {
  text: string;
  key: string;
  start: string;
  end: string;
  cell: SourceRef;
}

function staleYearFlag(text: string, year: number): ExcelFlag | null {
  const years = (text.match(/\b20\d{2}\b/g) ?? []).map(Number);
  if (!years.length || years.some((y) => y === year || y === year + 1)) return null;
  return flag("stale-year-in-text", "warn", `This tag mentions ${years.join(" / ")}, which is not ${year}; it may be left over from an older calendar.`);
}

function buildSeasons(pieces: SeasonPiece[], year: number): ParsedSeason[] {
  // Join the same tag across neighbouring weeks into one season.
  const byKey = new Map<string, SeasonPiece[]>();
  for (const p of pieces) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  const out: ParsedSeason[] = [];
  for (const group of Array.from(byKey.values())) {
    group.sort((a, b) => a.start.localeCompare(b.start));
    const spans: SeasonPiece[] = [];
    for (const p of group) {
      const prev = spans[spans.length - 1];
      if (prev && daysBetween(prev.end, p.start) <= MAX_JOIN_GAP_DAYS) {
        if (p.end > prev.end) prev.end = p.end;
      } else spans.push({ ...p });
    }
    for (const s of spans) {
      const flags: ExcelFlag[] = [];
      let start = s.start;
      let end = s.end;
      let explicit = false;
      const ex = explicitDates(s.text, s.start);
      if (ex) {
        explicit = true;
        if (ex.end < s.start || ex.start > s.end) {
          flags.push(flag("season-date-mismatch", "error", `The dates written in this tag (${ex.start} to ${ex.end}) do not overlap where it sits on the grid (${s.start} to ${s.end}).`));
        }
        start = ex.start;
        end = ex.end;
      } else if (MONTH_ONLY_RANGE.test(s.text)) {
        flags.push(flag("season-no-dates", "warn", "This tag gives months but no exact days, so its dates come from where it sits on the grid."));
      }
      const stale = staleYearFlag(s.text, year);
      if (stale) flags.push(stale);
      out.push({ text: s.text, start, end, explicitDates: explicit, source: s.cell, flags });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.text.localeCompare(b.text));
}

// ---------------------------------------------------------------------------
// Month sheets

const TIME_TOKEN = /\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\s*[ap]\.?m\b/i;

const outsideFlags = (flags: ExcelFlag[]) => flags.filter((f) => f.message.includes("outside"));

function eventsFromCell(raw: string, source: SourceRef, date: string, base: ExcelFlag[]): ParsedEvent[] {
  const parts = splitEventCell(raw);
  return parts.map((p) => {
    const flags: ExcelFlag[] = [...base];
    if (!p.name) flags.push(flag("no-name", "error", "This cell has a time but no event name."));
    if (p.start === null) flags.push(flag("no-time", "warn", "No time found for this event."));
    if (parts.length > 1) flags.push(flag("multi-event-cell", "warn", `This cell held ${parts.length} events; they were split by their times. Check the split.`));
    return { date, name: p.name, details: p.details, start: p.start, end: p.end, source, flags };
  });
}

function parseMonthSheet(sheet: XlsxSheet, month: number, year: number, workbookFlags: SheetFlag[]): ParsedMonth {
  const result: ParsedMonth = { month, year, sheetName: sheet.name, events: [], seasons: [], observances: [], weekNotes: [] };
  const sheetFlag = (f: ExcelFlag, row = 1, col = 1) => workbookFlags.push({ ...f, source: sourceRef(sheet, row, col) });

  const header = findHeaderRow(sheet);
  if (header === null) {
    sheetFlag(flag("no-weekday-header", "error", `Sheet "${sheet.name}" has no MONDAY to SUNDAY header row in columns P to V, so nothing was read from it.`));
    return result;
  }

  const sheetYearCell = cellText(sheet, 2, 1).trim();
  if (/^\d{4}$/.test(sheetYearCell) && Number(sheetYearCell) !== year) {
    sheetFlag(flag("bad-year", "warn", `Sheet "${sheet.name}" says ${year} in its name but ${sheetYearCell} in cell A2.`), 2, 1);
  }

  const dayRows: number[] = [];
  for (let r = header + 1; r <= sheet.maxRow; r++) if (isDayRow(sheet, r)) dayRows.push(r);
  if (!dayRows.length) {
    sheetFlag(flag("unknown-layout", "error", `Sheet "${sheet.name}" has a weekday header but no rows of day numbers under it.`), header, GRID_FIRST_COL);
    return result;
  }

  // Anchor on the first "1" in the grid (the month's first day): its position gives the Monday of week 0.
  // Day numbers elsewhere are only checked against it, because hand-edited sheets carry stale numbers.
  let anchor: string | null = null;
  for (let w = 0; w < dayRows.length && anchor === null; w++) {
    for (let i = 0; i < 7 && anchor === null; i++) {
      if (dayCell(sheet, dayRows[w], i)?.day === 1) anchor = addDays(toIso(year, month, 1), -(7 * w + i));
    }
  }
  // No "1" at all: fall back to the first numbered cell of the first week (a number over 20 is the previous month's).
  for (let i = 0; i < 7 && anchor === null; i++) {
    const d = dayCell(sheet, dayRows[0], i);
    if (!d) continue;
    const prev = d.day > 20;
    const y = prev && month === 1 ? year - 1 : year;
    const m = prev ? (month === 1 ? 12 : month - 1) : month;
    if (isRealDate(y, m, d.day)) anchor = addDays(toIso(y, m, d.day), -i);
  }
  if (anchor === null || dayOfWeek(anchor) !== 1) {
    sheetFlag(flag("unknown-layout", "error", `Sheet "${sheet.name}": could not find the month's first day on the grid, or it does not line up with a Monday-first week, so its dates cannot be trusted.`), dayRows[0], GRID_FIRST_COL);
    return result;
  }
  let mismatched = 0;

  const pieces: SeasonPiece[] = [];
  dayRows.forEach((dayRow, w) => {
    const monday = addDays(anchor as string, 7 * w);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const blockEnd = (dayRows[w + 1] ?? sheet.maxRow + 1) - 1;

    // Day numbers + observances.
    const cellFlags: ExcelFlag[][] = dates.map(() => []);
    for (let i = 0; i < 7; i++) {
      const d = dayCell(sheet, dayRow, i);
      if (!d) continue;
      const date = dates[i];
      if (Number(date.slice(8, 10)) !== d.day) {
        mismatched++;
        cellFlags[i].push(flag("date-outside-month", "warn", `The day number ${d.day} does not match its place on the grid (${date}).`));
      }
      if (Number(date.slice(5, 7)) !== month || Number(date.slice(0, 4)) !== year) {
        cellFlags[i].push(flag("date-outside-month", "warn", `${date} is outside ${sheet.name}'s month; it is also shown on the neighbouring month's sheet.`));
      }
      if (d.rest) {
        result.observances.push({ date, name: d.rest, source: sourceRef(sheet, dayRow, GRID_FIRST_COL + i), flags: [...cellFlags[i]] });
      }
    }

    // The events row is the last row of the block (the one just above the next day-number row), even when
    // empty. After the final week there is no next row to anchor on, so take the last row with content.
    // Either way, a row made only of merged text with no times is another season tag, not events.
    let eventsRow: number | null = null;
    const candidate = w < dayRows.length - 1 ? blockEnd : lastContentRow(sheet, dayRow + 1, blockEnd);
    if (candidate !== null && candidate > dayRow) {
      let seasonLike = rowHasContent(sheet, candidate);
      for (let i = 0; i < 7 && seasonLike; i++) {
        const text = cellText(sheet, candidate, GRID_FIRST_COL + i);
        if (text.trim() && (hasTimeRange(text) || text.startsWith("\n") || !inAnyMerge(sheet, candidate, GRID_FIRST_COL + i))) seasonLike = false;
      }
      eventsRow = seasonLike ? null : candidate;
    }

    // Season tags: every cell between the day row and the events row.
    for (let r = dayRow + 1; r < (eventsRow ?? blockEnd + 1); r++) {
      for (let i = 0; i < 7; i++) {
        const col = GRID_FIRST_COL + i;
        const raw = cellText(sheet, r, col);
        const text = collapse(raw);
        if (!text) continue;
        if (TIME_TOKEN.test(raw)) {
          // A time means this is an event that sits among the season tags, not a tag.
          for (const ev of eventsFromCell(raw, sourceRef(sheet, r, col), dates[i], [...outsideFlags(cellFlags[i]), flag("event-in-season-row", "warn", "This event sat among the season tags rather than in the events row.")])) result.events.push(ev);
          continue;
        }
        const merge = mergeAt(sheet, r, col);
        const last = merge ? Math.min(6, merge.c2 - GRID_FIRST_COL) : i;
        pieces.push({ text, key: tagKey(text), start: dates[i], end: dates[Math.max(i, last)], cell: sourceRef(sheet, r, col) });
      }
    }

    // Events row.
    if (eventsRow !== null) {
      for (let i = 0; i < 7; i++) {
        const col = GRID_FIRST_COL + i;
        const raw = cellText(sheet, eventsRow, col);
        if (!raw.trim()) continue;
        const source = sourceRef(sheet, eventsRow, col);
        const date = dates[i];
        const extra = cellFlags[i];
        let ambiguous = false;
        if (i === 0) {
          const kind = looksLikeWeekNote(raw);
          if (kind === "yes") {
            result.weekNotes.push({ weekStart: dates[0], weekEnd: dates[6], text: cleanNotes(raw), source, flags: [] });
            continue;
          }
          ambiguous = kind === "maybe";
        }
        const flags = outsideFlags(extra);
        if (ambiguous) flags.push(flag("ambiguous-week-note", "warn", "This Monday cell could be a week note rather than an event."));
        for (const ev of eventsFromCell(raw, source, date, flags)) result.events.push(ev);
      }
    }

    // Week-note flags for unrecognised leftovers are not needed: every events-row cell was either an event or a note.
  });

  if (mismatched) {
    sheetFlag(flag("unknown-layout", "warn", `Sheet "${sheet.name}": ${mismatched} day number(s) do not match their place on the grid; dates were taken from the position of the 1st of the month.`), header, GRID_FIRST_COL);
  }
  const built = buildSeasons(pieces, year);
  result.seasons = built;
  return result;
}

// ---------------------------------------------------------------------------
// Checklist sheet

function parseDone(cell: ReturnType<typeof getCell>): boolean | null | "?" {
  if (!cell) return null;
  const v = cell.value;
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : "?";
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "y", "done", "x", "✓", "✔"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return "?";
}

function parseChecklist(sheet: XlsxSheet): ParsedChecklistItem[] {
  const out: ParsedChecklistItem[] = [];
  let section = collapse(cellText(sheet, 1, 1)) || "Checklist";
  const isHeader = (r: number) => cellText(sheet, r, 2).trim().toUpperCase() === "ITEM";
  let last: ParsedChecklistItem | null = null;

  for (let r = 1; r <= sheet.maxRow; r++) {
    const a = cellText(sheet, r, 1).trim();
    const b = cellText(sheet, r, 2).trim();
    const c = getCell(sheet, r, 3);
    if (!a && !b && !c) continue;
    if (isHeader(r)) continue;
    const numeric = /^\d+(?:\.\d+)?\.?$/.test(a);

    // A heading: text in A (not a number) with nothing beside it, or a lone B line just above a header row.
    const nextHeader = (() => {
      for (let n = r + 1; n <= Math.min(sheet.maxRow, r + 3); n++) {
        if (isHeader(n)) return true;
        if (cellText(sheet, n, 1).trim() || cellText(sheet, n, 2).trim()) return false;
      }
      return false;
    })();
    if ((a && !numeric && !b && !c) || (!a && b && !c && nextHeader)) {
      section = collapse(a || b);
      last = null;
      continue;
    }

    const lines = b.split(/\r?\n/).map((l) => cleanText(l)).filter(Boolean);
    if (!lines.length) continue;
    if (!a && !c && last) {
      // A line under the previous item with no number and no tick: a sub-item.
      last.subitems.push(...lines);
      continue;
    }
    const done = parseDone(c);
    const flags: ExcelFlag[] = [];
    if (done === null) flags.push(flag("no-done-flag", "warn", "The DONE? cell is blank, so this is treated as not done."));
    if (done === "?") flags.push(flag("no-done-flag", "warn", "The DONE? cell is not 1, 0, TRUE or FALSE, so this is treated as not done."));
    last = {
      section,
      number: a || null,
      item: lines[0],
      subitems: lines.slice(1),
      done: done === "?" ? null : done,
      source: sourceRef(sheet, r, 2),
      flags,
    };
    out.push(last);
  }
  return out;
}

// ---------------------------------------------------------------------------

export function parseCalendarWorkbook(wb: XlsxWorkbook): ParsedWorkbook {
  const result: ParsedWorkbook = { year: null, months: [], checklist: [], flags: [], ignoredSheets: [] };
  const seen = new Set<string>();

  for (const sheet of wb.sheets) {
    if (/^\s*checklist\s*$/i.test(sheet.name)) {
      result.checklist.push(...parseChecklist(sheet));
      continue;
    }
    const parsed = parseSheetName(sheet.name);
    if (!parsed) {
      result.ignoredSheets.push(sheet.name);
      continue;
    }
    if (parsed.year < MIN_YEAR || parsed.year > MAX_YEAR) {
      result.flags.push({
        ...flag("bad-year", "error", `Sheet "${sheet.name}" has the year ${parsed.year}, which is outside ${MIN_YEAR} to ${MAX_YEAR}, so it was skipped.`),
        source: sourceRef(sheet, 1, 1),
      });
      continue;
    }
    const id = `${parsed.year}-${parsed.month}`;
    if (seen.has(id)) {
      result.flags.push({
        ...flag("unknown-layout", "warn", `More than one sheet is for ${id}; the later one ("${sheet.name}") was still read.`),
        source: sourceRef(sheet, 1, 1),
      });
    }
    seen.add(id);
    result.months.push(parseMonthSheet(sheet, parsed.month, parsed.year, result.flags));
  }

  const tally = new Map<number, number>();
  for (const m of result.months) tally.set(m.year, (tally.get(m.year) ?? 0) + 1);
  let best: [number, number] | null = null;
  for (const [y, n] of Array.from(tally.entries())) if (!best || n > best[1]) best = [y, n];
  result.year = best ? best[0] : null;
  return result;
}
