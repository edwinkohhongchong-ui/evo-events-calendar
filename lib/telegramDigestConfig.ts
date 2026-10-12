import { addDays, format } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { cleanMultiline, cleanText } from "./telegramDigest";
import type { DigestRangeMode, TelegramDigestRow } from "./types";

// Pure rules for the configurable Telegram digests (migration 029): the
// settings shape, validation, and "is this digest due today". No Supabase or
// network here, so the Server Actions, the cron route and the tests share it.

/** The settings an Editor can change (everything except bookkeeping columns). */
export type DigestConfig = Omit<TelegramDigestRow, "id" | "last_sent_on" | "created_at" | "updated_at">;

export const DIGEST_NAME_MAX = 80;
export const DIGEST_LEVEL_MAX = 30;
export const DIGEST_LEVELS_MAX_COUNT = 50;
export const DIGEST_TEXT_MAX = 1000; // intro / closing line
export const DIGEST_OVERRIDE_MAX = 4000; // edited message
export const DIGEST_RANGE_DAYS_MAX = 90;
export const DIGEST_BIG_WEEKS_MAX = 26;

export const DIGEST_MIGRATION_HINT = "Digests aren't switched on yet. Please tell Edwin.";

export const RANGE_MODES: readonly DigestRangeMode[] = ["rest_of_month", "this_week", "next_days"];

/** Sunday = 0 ... Saturday = 6, matching `days_of_week` and Date#getDay. */
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Chip order for the editor: Monday first, like the calendar grid. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** The built-in Sunday message, as a config (used to pre-fill "Create from the default"). */
export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  name: "Sunday digest",
  enabled: true,
  days_of_week: [0],
  range_mode: "rest_of_month",
  range_days: 14,
  include_events: true,
  include_gatherings: true,
  levels: [],
  include_big_events: true,
  big_lookahead_weeks: 8,
  include_checklist_counts: true,
  intro: null,
  outro: null,
  override_text: null,
  skip_next: false,
};

/** Weekday (0 = Sunday) of a Singapore yyyy-MM-dd day string. */
export function weekdayOf(dateStr: string): number {
  return parseDateStr(dateStr).getDay();
}

/** Enabled, today's weekday is picked, and not already sent today. */
export function isDueToday(
  digest: Pick<TelegramDigestRow, "enabled" | "days_of_week" | "last_sent_on">,
  sgToday: string
): boolean {
  return digest.enabled && digest.days_of_week.includes(weekdayOf(sgToday)) && digest.last_sent_on !== sgToday;
}

/**
 * The next day (today counts until it has been sent) a digest is due, as
 * yyyy-MM-dd, or null when it is switched off. `skip_next` moves the answer
 * to the send after.
 */
export function nextSendDate(
  digest: Pick<TelegramDigestRow, "enabled" | "days_of_week" | "last_sent_on" | "skip_next">,
  sgToday: string
): string | null {
  if (!digest.enabled || digest.days_of_week.length === 0) return null;
  let skips = digest.skip_next ? 1 : 0;
  for (let i = 0; i <= 14; i += 1) {
    const day = toDateStr(addDays(parseDateStr(sgToday), i));
    if (!isDueToday(digest, day)) continue;
    if (skips === 0) return day;
    skips -= 1;
  }
  return null;
}

export function formatDayShort(dateStr: string): string {
  return format(parseDateStr(dateStr), "EEE d MMM");
}

/** Plain-language summary of what a digest covers ("Rest of this month", "Next 14 days"). */
export function rangeSummary(config: Pick<DigestConfig, "range_mode" | "range_days">): string {
  if (config.range_mode === "this_week") return "This week";
  if (config.range_mode === "next_days") return `Next ${config.range_days} ${config.range_days === 1 ? "day" : "days"}`;
  return "Rest of this month";
}

/** Short day list like "Sun" or "Mon, Thu", in calendar order. */
export function daysSummary(days: readonly number[]): string {
  const picked = WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]);
  return picked.length === 7 ? "Every day" : picked.join(", ");
}

/** 42P01 = relation missing, PGRST205 = PostgREST schema cache lacks the table. */
export function isMissingDigestTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const missing =
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/telegram_digests/i.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? ""));
  if (missing) console.error("telegram_digests table missing: run migration 029.");
  return missing;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readBool(raw: Record<string, unknown>, key: keyof DigestConfig, fallback: boolean): boolean {
  const v = raw[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") throw new Error("Some of the digest settings are not valid.");
  return v;
}

function readInt(raw: Record<string, unknown>, key: keyof DigestConfig, fallback: number, max: number, label: string): number {
  const v = raw[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) throw new Error(`${label} must be a whole number from 1 to ${max}.`);
  return v;
}

function readText(raw: Record<string, unknown>, key: keyof DigestConfig, max: number, label: string): string | null {
  const v = raw[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new Error(`${label} must be text.`);
  const text = cleanMultiline(v);
  if (text.length > max) throw new Error(`${label} can be at most ${max} characters.`);
  return text || null;
}

/**
 * Validates and cleans a digest's settings from the browser (never trusted).
 * Missing optional fields take the default; anything wrong throws a message
 * that is safe to show the user.
 */
export function normaliseDigestConfig(raw: unknown): DigestConfig {
  if (!isRecord(raw)) throw new Error("Some of the digest settings are not valid.");
  const d = DEFAULT_DIGEST_CONFIG;

  const name = cleanText(typeof raw.name === "string" ? raw.name : "", DIGEST_NAME_MAX);
  if (!name) throw new Error("Please give the digest a name.");

  const rawDays = raw.days_of_week === undefined ? d.days_of_week : raw.days_of_week;
  if (!Array.isArray(rawDays) || !rawDays.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6)) {
    throw new Error("Some of the digest settings are not valid.");
  }
  const days = Array.from(new Set(rawDays as number[])).sort((a, b) => a - b);
  if (days.length === 0) throw new Error("Pick at least one day to send on.");

  const mode = raw.range_mode === undefined ? d.range_mode : raw.range_mode;
  if (!RANGE_MODES.includes(mode as DigestRangeMode)) throw new Error("Some of the digest settings are not valid.");

  const rawLevels = raw.levels === undefined || raw.levels === null ? [] : raw.levels;
  if (!Array.isArray(rawLevels) || rawLevels.some((l) => typeof l !== "string") || rawLevels.length > DIGEST_LEVELS_MAX_COUNT) {
    throw new Error("Some of the digest settings are not valid.");
  }
  const levels: string[] = [];
  for (const l of rawLevels as string[]) {
    const cleaned = cleanText(l, DIGEST_LEVEL_MAX);
    if (cleaned && !levels.some((x) => x.toLowerCase() === cleaned.toLowerCase())) levels.push(cleaned);
  }

  return {
    name,
    enabled: readBool(raw, "enabled", d.enabled),
    days_of_week: days,
    range_mode: mode as DigestRangeMode,
    range_days: readInt(raw, "range_days", d.range_days, DIGEST_RANGE_DAYS_MAX, "The number of days"),
    include_events: readBool(raw, "include_events", d.include_events),
    include_gatherings: readBool(raw, "include_gatherings", d.include_gatherings),
    levels,
    include_big_events: readBool(raw, "include_big_events", d.include_big_events),
    big_lookahead_weeks: readInt(raw, "big_lookahead_weeks", d.big_lookahead_weeks, DIGEST_BIG_WEEKS_MAX, "The weeks ahead"),
    include_checklist_counts: readBool(raw, "include_checklist_counts", d.include_checklist_counts),
    intro: readText(raw, "intro", DIGEST_TEXT_MAX, "The intro line"),
    outro: readText(raw, "outro", DIGEST_TEXT_MAX, "The closing line"),
    override_text: readText(raw, "override_text", DIGEST_OVERRIDE_MAX, "The edited message"),
    skip_next: readBool(raw, "skip_next", d.skip_next),
  };
}

/** The editable settings of a saved row (drops id and bookkeeping). */
export function configOf(row: TelegramDigestRow): DigestConfig {
  return {
    name: row.name,
    enabled: row.enabled,
    days_of_week: row.days_of_week,
    range_mode: row.range_mode,
    range_days: row.range_days,
    include_events: row.include_events,
    include_gatherings: row.include_gatherings,
    levels: row.levels,
    include_big_events: row.include_big_events,
    big_lookahead_weeks: row.big_lookahead_weeks,
    include_checklist_counts: row.include_checklist_counts,
    intro: row.intro,
    outro: row.outro,
    override_text: row.override_text,
    skip_next: row.skip_next,
  };
}
