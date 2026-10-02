// Shared types for the "Import education schedules from Word" pipeline
// (readDocx -> parseSchedule -> classify -> diff). Pure data, no I/O.

export type FlagSeverity = "warn" | "error";

export type FlagCode =
  | "tentative"
  | "year-mismatch"
  | "end-before-start"
  | "unrecognised-label"
  | "ambiguous-institution"
  | "not-published"
  | "invalid-date"
  | "unparsed-text"
  | "no-section"
  | "sunday-mismatch";

export interface Flag {
  code: FlagCode;
  severity: FlagSeverity;
  /** Plain-language explanation shown to the reviewer. */
  message: string;
  /** 1-based line number (in the lines passed to the parser) the flag is about. */
  row: number;
}

export type ScheduleSection =
  | "Public Holidays"
  | "Primary School"
  | "Secondary School"
  | "Junior College"
  | "Polytechnic"
  | "University";

export interface ParsedItem {
  section: ScheduleSection | null;
  /** e.g. "School Holidays", "PSLE", "N Level", "NP, TP, NYP", "NUS". null under Public Holidays. */
  group: string | null;
  label: string;
  /** yyyy-MM-dd */
  start: string;
  /** yyyy-MM-dd; equals start for a single day. */
  end: string;
  institutions?: string[];
  tentative: boolean;
  /** The qualifier wording that made it tentative, e.g. "will be available by 3 March 2026". */
  tentativeText?: string;
  notes: string[];
  /** From "this is a Sunday, <date> will be PH". */
  observedDate?: string;
  sourceLine: number;
  sourceText: string;
  flags: Flag[];
}

export interface IgnoredLine {
  line: number;
  text: string;
}

export interface ParsedSchedule {
  title: string | null;
  docYear: number | null;
  items: ParsedItem[];
  ignoredLines: IgnoredLine[];
  /** Document-level problems that are not tied to one item. */
  issues: Flag[];
}
