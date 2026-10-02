import {
  addDays,
  dayOfWeek,
  leftoverText,
  monthNumber,
  MONTH_PATTERN,
  scanTokens,
  toIso,
  yearOf,
  ScanToken,
} from "./dateText";
import { labelKind } from "./labels";
import { cleanText } from "./text";
import {
  Flag,
  FlagCode,
  FlagSeverity,
  IgnoredLine,
  ParsedItem,
  ParsedSchedule,
  ScheduleSection,
} from "./types";

export const KNOWN_INSTITUTIONS = new Set([
  "NP", "TP", "NYP", "SP", "RP", "NUS", "NTU", "SMU", "SIT", "SUTD", "SUSS",
]);

// ---------------------------------------------------------------------------
// Heading recognition (case-insensitive, tolerant of small typos)
// ---------------------------------------------------------------------------

const SECTION_CANON: Array<[string, ScheduleSection]> = [
  ["public holidays", "Public Holidays"],
  ["public holiday", "Public Holidays"],
  ["primary school", "Primary School"],
  ["primary", "Primary School"],
  ["secondary school", "Secondary School"],
  ["secondary", "Secondary School"],
  ["junior college", "Junior College"],
  ["jc", "Junior College"],
  ["polytechnic", "Polytechnic"],
  ["polytechnics", "Polytechnic"],
  ["poly", "Polytechnic"],
  ["university", "University"],
  ["universities", "University"],
];

const GROUP_CANON: Array<[string, string]> = [
  ["school holidays", "School Holidays"],
  ["school holiday", "School Holidays"],
  ["psle dates", "PSLE"],
  ["psle", "PSLE"],
  ["n level", "N Level"],
  ["o level", "O Level"],
  ["a level", "A Level"],
];

function normaliseHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Exact match first; otherwise a unique near match for longer headings only
 *  (short ones like "N Level" vs "O Level" are one letter apart, so no fuzz). */
function fuzzyLookup<T>(text: string, canon: Array<[string, T]>): T | null {
  const n = normaliseHeading(text);
  if (!n) return null;
  const exact = canon.find(([k]) => k === n);
  if (exact) return exact[1];
  const allowed = n.length >= 14 ? 2 : n.length >= 9 ? 1 : 0;
  if (allowed === 0) return null;
  let best = Infinity;
  const winners = new Set<T>();
  for (const [k, v] of canon) {
    if (k.length < 9) continue;
    const dist = editDistance(n, k);
    if (dist > allowed) continue;
    if (dist < best) {
      best = dist;
      winners.clear();
    }
    if (dist === best) winners.add(v);
  }
  const found = Array.from(winners);
  return found.length === 1 ? found[0] : null;
}

const TENTATIVE_RE = /tentative|subject to confirmation|will be available by|to be confirmed|\btbc\b/i;
const NOT_PUBLISHED_RE = /\b(?:did(?:n't| not)|have(?:n't| not)|not)\s+(?:yet\s+)?publish(?:ed)?/i;

interface GroupState {
  name: string;
  institutions?: string[];
  tentativeText?: string;
  /** An institution that has not published dates (from this month onward, if given). */
  unpublished?: { institution: string; from?: string };
}

type Heading =
  | { kind: "section"; section: ScheduleSection }
  | { kind: "group"; group: GroupState };

function stripTentativeWord(text: string): string {
  const rest = text.replace(/^\s*tentative\b[\s,;:-]*/i, "").trim();
  return rest || text.trim();
}

function parseUnpublished(parens: string[], institutions: string[]): GroupState["unpublished"] {
  for (const p of parens) {
    if (!NOT_PUBLISHED_RE.test(p)) continue;
    const inst = institutions.find((i) => new RegExp(`\\b${i}\\b`).test(p));
    if (!inst) continue;
    const m = p.match(new RegExp(`(${MONTH_PATTERN})\\s+(\\d{4})\\s+onwards`, "i"));
    return { institution: inst, from: m ? toIso(Number(m[2]), monthNumber(m[1]), 1) : undefined };
  }
  return undefined;
}

function detectHeading(text: string): Heading | null {
  const parens = Array.from(text.matchAll(/\(([^()]*)\)/g)).map((m) => m[1].trim());
  const outside = text.replace(/\([^()]*\)/g, " ").replace(/\s+/g, " ").trim();
  const colon = outside.indexOf(":");
  if (colon >= 0 && outside.slice(colon + 1).trim()) return null; // "Label: value" row
  const head = outside.replace(/:\s*$/, "").trim();
  if (!head || head.length > 40 || /\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(head)) return null;

  const codes = head.split(/\s*,\s*/);
  if (codes.every((c) => KNOWN_INSTITUTIONS.has(c))) {
    return {
      kind: "group",
      group: {
        name: codes.join(", "),
        institutions: codes,
        tentativeText: tentativeFrom(parens),
        unpublished: parseUnpublished(parens, codes),
      },
    };
  }
  const section = fuzzyLookup(head, SECTION_CANON);
  if (section) return { kind: "section", section };
  const group = fuzzyLookup(head, GROUP_CANON);
  if (group) return { kind: "group", group: { name: group, tentativeText: tentativeFrom(parens) } };
  return null;
}

function tentativeFrom(parens: string[]): string | undefined {
  const hit = parens.find((p) => TENTATIVE_RE.test(p));
  return hit ? stripTentativeWord(hit) : undefined;
}

// ---------------------------------------------------------------------------
// Line preparation
// ---------------------------------------------------------------------------

interface Entry {
  line: number;
  text: string;
}

function clean(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** A trailing comma means the list wraps onto the next paragraph. */
function joinWrapped(lines: string[]): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    let text = clean(lines[i]);
    if (!text) continue;
    const line = i + 1;
    while (text.endsWith(",") && i + 1 < lines.length) {
      const next = clean(lines[i + 1]);
      if (!next || !/^[\d(]/.test(next)) break;
      text = `${text} ${next}`;
      i++;
    }
    entries.push({ line, text });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

interface RawEntry {
  start: string;
  end: string;
  parens: string[];
}

function mkFlag(code: FlagCode, severity: FlagSeverity, message: string, row: number): Flag {
  return { code, severity, message, row };
}

const SUNDAY_RE = /this is a sunday,?\s*(.*?)\s*will be\s+(?:a\s+)?(?:PH|public holiday)/i;

function splitLabel(text: string): { label: string; value: string } | null {
  const idx = text.indexOf(":");
  if (idx <= 0) return null;
  const label = text.slice(0, idx).trim();
  if (scanTokens(label).some((t) => t.kind !== "paren")) return null;
  return { label, value: text.slice(idx + 1).trim() };
}

interface State {
  section: ScheduleSection | null;
  group: GroupState | null;
}

function parseRow(entry: Entry, state: State, items: ParsedItem[], issues: Flag[]): boolean {
  let text = entry.text;
  const wrapped = /^\((.*)\)\.?$/.exec(text);
  let label: string;
  let value: string;
  let rowTentative: string | undefined;
  let labelFlag = false;

  if (wrapped && /^mid[ -]?terms?\b/i.test(wrapped[1])) {
    // "(Mid-terms should fall between 2 March 2026 - 20 March 2026)" - an expected window.
    label = "Mid-terms";
    const firstDate = scanTokens(wrapped[1]).find((t) => t.kind !== "paren");
    value = firstDate ? wrapped[1].slice(firstDate.index) : wrapped[1];
    rowTentative = "expected window only, not confirmed dates";
  } else {
    if (wrapped) text = wrapped[1];
    const split = splitLabel(text);
    if (split) {
      label = split.label;
      value = split.value;
    } else if (/^\d/.test(text)) {
      label = state.group?.name === "School Holidays" ? "School Holidays" : state.group?.name ?? "";
      value = text;
      labelFlag = state.group?.name !== "School Holidays";
    } else {
      const first = scanTokens(text).find((t) => t.kind !== "paren");
      label = first ? text.slice(0, first.index).replace(/[\s:,-]+$/, "").trim() : "";
      value = first ? text.slice(first.index) : text;
      labelFlag = true;
    }
  }

  const tokens = scanTokens(value);
  const dateTokens = tokens.filter((t) => t.kind !== "paren");
  if (dateTokens.length === 0) return false;

  const rowFlags: Flag[] = [];
  const entries: RawEntry[] = [];
  let pending: string[] = [];
  const attachParen = (p: string) => {
    if (entries.length) entries[entries.length - 1].parens.push(p);
    else pending.push(p);
  };
  for (const t of tokens) {
    if (t.kind === "paren") attachParen(t.text);
    else if (t.kind === "invalid") {
      rowFlags.push(
        mkFlag("invalid-date", "error", `"${t.raw}" is not a real calendar date, so it was skipped.`, entry.line)
      );
    } else {
      entries.push({ start: t.start, end: t.end, parens: pending });
      pending = [];
    }
  }
  if (pending.length && entries.length) entries[0].parens.push(...pending);

  if (entries.length === 0) {
    // Every date on the row was impossible: nothing to import, but say so.
    issues.push(...rowFlags);
    return true;
  }

  const left = leftoverText(value, tokens as ScanToken[]);
  if (left) {
    rowFlags.push(
      mkFlag("unparsed-text", "warn", `Some text on this row was not understood and was ignored: "${left}".`, entry.line)
    );
  }

  const inGroup = state.group;
  const inPublicHolidays = state.section === "Public Holidays";
  if (!state.section) {
    rowFlags.push(mkFlag("no-section", "warn", "This row appears before any section heading (Primary, Secondary, ...).", entry.line));
  }
  if (labelFlag || (!inPublicHolidays && labelKind(label) === "unknown")) {
    rowFlags.push(
      mkFlag("unrecognised-label", "warn", `Unrecognised label "${label || "(none)"}" - check what kind of period this is.`, entry.line)
    );
  }

  // An entry with an institution code in its parentheses (e.g. "(SP)") is scoped
  // to those institutions; the rest fall back to the group's institutions.
  const instRe = /^[A-Z]{2,5}(?:\s*,\s*[A-Z]{2,5})*$/;
  const scoped = entries.map((e) => {
    const insts: string[] = [];
    const notes: string[] = [];
    let tentativeText: string | undefined = rowTentative;
    for (const p of e.parens) {
      if (instRe.test(p) && p.split(/\s*,\s*/).every((c) => KNOWN_INSTITUTIONS.has(c))) {
        insts.push(...p.split(/\s*,\s*/));
      } else {
        notes.push(p);
        if (TENTATIVE_RE.test(p) && !tentativeText) tentativeText = stripTentativeWord(p);
      }
    }
    return { e, insts, notes, tentativeText };
  });
  const someScoped = scoped.some((s) => s.insts.length > 0);
  const someUnscoped = scoped.some((s) => s.insts.length === 0);
  if (someScoped && someUnscoped && (inGroup?.institutions?.length ?? 0) > 1) {
    rowFlags.push(
      mkFlag(
        "ambiguous-institution",
        "warn",
        "Some dates on this row name an institution and some do not - check which institutions the unlabelled dates apply to.",
        entry.line
      )
    );
  }

  for (const s of scoped) {
    const flags: Flag[] = [...rowFlags];
    const institutions: string[] | undefined = s.insts.length ? s.insts : inGroup?.institutions;
    if (!s.insts.length && inGroup?.unpublished) {
      const { institution, from } = inGroup.unpublished;
      if (institutions?.includes(institution) && (!from || s.e.start >= from)) {
        // The row stays attached to every institution in the group (it applies to both
        // SP and RP until the missing one publishes); the flag tells the reviewer.
        flags.push(
          mkFlag(
            "not-published",
            "warn",
            `The document says ${institution} had not published its dates${from ? " from " + from.slice(0, 7) + " onwards" : ""}. This row is applied to ${institutions.join(" and ")} for now - check ${institution}'s own calendar once it publishes.`,
            entry.line
          )
        );
      }
    }
    const tentativeText = s.tentativeText ?? inGroup?.tentativeText;
    const item: ParsedItem = {
      section: state.section,
      group: inPublicHolidays ? null : inGroup?.name ?? null,
      label,
      start: s.e.start,
      end: s.e.end,
      institutions: institutions && institutions.length ? institutions : undefined,
      tentative: tentativeText !== undefined,
      tentativeText,
      notes: s.notes,
      sourceLine: entry.line,
      sourceText: entry.text,
      flags,
    };
    for (const n of s.notes) {
      const m = SUNDAY_RE.exec(n);
      if (!m) continue;
      const d = scanTokens(m[1]).find((t) => t.kind === "single");
      if (d && d.kind === "single") item.observedDate = d.start;
    }
    items.push(item);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function detectTitleYear(entries: Entry[]): { title: string | null; year: number | null } {
  for (const e of entries.slice(0, 3)) {
    if (!/schedules?/i.test(e.text)) continue;
    const y = e.text.match(/\b(20\d{2})\b/);
    return { title: e.text, year: y ? Number(y[1]) : null };
  }
  return { title: null, year: null };
}

function mostCommonYear(items: ParsedItem[]): number | null {
  const counts = new Map<number, number>();
  for (const it of items) counts.set(yearOf(it.start), (counts.get(yearOf(it.start)) ?? 0) + 1);
  let best: number | null = null;
  counts.forEach((c, y) => {
    if (best === null || c > counts.get(best)! || (c === counts.get(best)! && y > best)) best = y;
  });
  return best;
}

function finaliseFlags(item: ParsedItem, docYear: number | null): void {
  const row = item.sourceLine;
  if (item.tentative) {
    item.flags.push(
      mkFlag("tentative", "warn", `Marked tentative${item.tentativeText ? ": " + item.tentativeText : ""}.`, row)
    );
  }
  if (item.end < item.start) {
    const fix = `${yearOf(item.start)}${item.end.slice(4)}`;
    item.flags.push(
      mkFlag(
        "end-before-start",
        "error",
        `The end date (${item.end}) is before the start date (${item.start}). It may be a typo in the year (did they mean ${fix}?). Not guessed - fix the source or edit before importing.`,
        row
      )
    );
  }
  if (docYear !== null) {
    // A holiday range may legitimately run into the following year (e.g. 21 Nov - 2 Jan).
    const badStart = yearOf(item.start) !== docYear;
    const badEnd = yearOf(item.end) < docYear || yearOf(item.end) > docYear + 1;
    if (badStart || badEnd) {
      const bad = badStart ? item.start : item.end;
      const far = Math.abs(yearOf(bad) - docYear) > 1;
      item.flags.push(
        mkFlag(
          "year-mismatch",
          far ? "error" : "warn",
          `Dated ${yearOf(bad)} but this is the ${docYear} schedule. Check whether the year is a typo.`,
          row
        )
      );
    }
  }
  if (item.observedDate) {
    if (dayOfWeek(item.start) !== 0) {
      item.flags.push(
        mkFlag("sunday-mismatch", "warn", `The note says ${item.start} is a Sunday, but it is not. Check the date.`, row)
      );
    } else if (item.observedDate !== addDays(item.start, 1)) {
      item.flags.push(
        mkFlag(
          "sunday-mismatch",
          "warn",
          `The in-lieu day (${item.observedDate}) is not the Monday after ${item.start}. Check the date.`,
          row
        )
      );
    }
  }
}

export function parseScheduleLines(lines: string[], opts: { defaultYear?: number } = {}): ParsedSchedule {
  // Same text hygiene as the reader, so every name, note and source line downstream is clean
  // even when the lines did not come from readDocx. Line numbers are unchanged.
  const entries = joinWrapped(lines.map(cleanText));
  const { title, year: titleYear } = detectTitleYear(entries);
  const items: ParsedItem[] = [];
  const ignoredLines: IgnoredLine[] = [];
  const issues: Flag[] = [];
  const state: State = { section: null, group: null };

  for (const entry of entries) {
    if (title && entry.text === title) continue;
    const heading = detectHeading(entry.text);
    if (heading?.kind === "section") {
      state.section = heading.section;
      state.group = null;
      continue;
    }
    if (heading?.kind === "group") {
      state.group = heading.group;
      continue;
    }
    if (!parseRow(entry, state, items, issues)) {
      ignoredLines.push({ line: entry.line, text: entry.text });
    }
  }

  const docYear = titleYear ?? mostCommonYear(items) ?? opts.defaultYear ?? null;
  if (docYear === null) {
    issues.push(mkFlag("year-mismatch", "warn", "Could not work out which year this document is for.", 1));
  }
  for (const it of items) finaliseFlags(it, docYear);

  return { title, docYear, items, ignoredLines, issues };
}
