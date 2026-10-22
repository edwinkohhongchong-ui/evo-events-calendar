import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIGEST_CONFIG,
  configOf,
  daysSummary,
  hasUnfinishedClaim,
  isDueToday,
  lastRunLine,
  needsAttention,
  nextSendLine,
  isMissingDigestTable,
  nextSendDate,
  normaliseDigestConfig,
  rangeSummary,
  weekdayOf,
} from "../telegramDigestConfig";
import { sgDateStr } from "../dates";
import { requiredLoadEnd } from "../telegramDigest";
import type { TelegramDigestRow } from "../types";

const row = (over: Partial<TelegramDigestRow> = {}): TelegramDigestRow => ({
  ...DEFAULT_DIGEST_CONFIG,
  id: "d1",
  last_sent_on: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const SUN = "2026-10-11"; // Sunday
const MON = "2026-10-12";

describe("isDueToday", () => {
  it("needs enabled, a matching Singapore weekday and no send yet today", () => {
    expect(isDueToday(row(), SUN)).toBe(true);
    expect(isDueToday(row({ enabled: false }), SUN)).toBe(false);
    expect(isDueToday(row(), MON)).toBe(false);
    expect(isDueToday(row({ last_sent_on: SUN }), SUN)).toBe(false);
    expect(isDueToday(row({ last_sent_on: "2026-10-04" }), SUN)).toBe(true);
    expect(isDueToday(row({ days_of_week: [1, 4] }), MON)).toBe(true);
  });

  it("matches the weekday of the Singapore date, around the UTC boundary", () => {
    // The 11:30 UTC cron is 19:30 in Singapore, the same day.
    expect(weekdayOf(sgDateStr(new Date("2026-10-11T11:30:00Z")))).toBe(0);
    // A trigger delayed past 16:00 UTC is already Monday in Singapore.
    expect(weekdayOf(sgDateStr(new Date("2026-10-11T16:30:00Z")))).toBe(1);
    expect(isDueToday(row(), sgDateStr(new Date("2026-10-11T16:30:00Z")))).toBe(false);
    expect(isDueToday(row({ days_of_week: [1] }), sgDateStr(new Date("2026-10-11T16:30:00Z")))).toBe(true);
  });
});

describe("nextSendDate", () => {
  it("counts today until it has been sent, then moves on", () => {
    expect(nextSendDate(row(), SUN)).toBe(SUN);
    expect(nextSendDate(row({ last_sent_on: SUN }), SUN)).toBe("2026-10-18");
  });
  it("skips one send when skip_next is on, and is null when switched off", () => {
    expect(nextSendDate(row({ skip_next: true }), SUN)).toBe("2026-10-18");
    expect(nextSendDate(row({ enabled: false }), SUN)).toBeNull();
  });
});

describe("summaries", () => {
  it("describes days and range in plain words", () => {
    expect(daysSummary([0, 4, 1])).toBe("Mon, Thu, Sun");
    expect(daysSummary([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(rangeSummary({ range_mode: "next_days", range_days: 14 })).toBe("Next 14 days");
    expect(rangeSummary({ range_mode: "this_week", range_days: 14 })).toBe("This week");
  });
});

describe("normaliseDigestConfig", () => {
  it("accepts the default and fills missing optional fields", () => {
    expect(normaliseDigestConfig({ name: "  Weekly  " })).toEqual({ ...DEFAULT_DIGEST_CONFIG, name: "Weekly" });
    expect(configOf(row())).toEqual(DEFAULT_DIGEST_CONFIG);
  });

  it("sorts and de-duplicates days and rejects none or out-of-range ones", () => {
    expect(normaliseDigestConfig({ name: "a", days_of_week: [4, 1, 4] }).days_of_week).toEqual([1, 4]);
    expect(() => normaliseDigestConfig({ name: "a", days_of_week: [] })).toThrow("at least one day");
    expect(() => normaliseDigestConfig({ name: "a", days_of_week: [7] })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", days_of_week: ["1"] })).toThrow();
  });

  it("requires a name and caps it", () => {
    expect(() => normaliseDigestConfig({ name: "  \n " })).toThrow("name");
    expect(() => normaliseDigestConfig(null)).toThrow();
    expect(normaliseDigestConfig({ name: "x".repeat(200) }).name.length).toBeLessThanOrEqual(80);
  });

  it("validates range mode, day count and weeks ahead", () => {
    expect(() => normaliseDigestConfig({ name: "a", range_mode: "forever" })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", range_days: 0 })).toThrow("1 to 90");
    expect(() => normaliseDigestConfig({ name: "a", range_days: 91 })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", range_days: 1.5 })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", range_days: NaN })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", big_lookahead_weeks: 27 })).toThrow("1 to 26");
    expect(normaliseDigestConfig({ name: "a", range_mode: "next_days", range_days: 90, big_lookahead_weeks: 26 }).range_days).toBe(90);
  });

  it("rejects non-boolean flags", () => {
    expect(() => normaliseDigestConfig({ name: "a", enabled: "yes" })).toThrow();
    expect(() => normaliseDigestConfig({ name: "a", skip_next: 1 })).toThrow();
  });

  it("cleans category names (case-insensitive de-dup) and rejects non-strings", () => {
    expect(normaliseDigestConfig({ name: "a", levels: ["Youth", "youth", " Adults\n", ""] }).levels).toEqual(["Youth", "Adults"]);
    expect(() => normaliseDigestConfig({ name: "a", levels: [1] })).toThrow();
  });

  it("cleans intro, closing line and edited message but keeps line breaks, and enforces the caps", () => {
    const c = normaliseDigestConfig({ name: "a", intro: "Hi‮ all\r\n\r\n\r\n\r\nline\u0000two  ", outro: "   ", override_text: "x\ny" });
    expect(c.intro).toBe("Hi all\n\nline two");
    expect(c.outro).toBeNull();
    expect(c.override_text).toBe("x\ny");
    expect(() => normaliseDigestConfig({ name: "a", intro: "i".repeat(1001) })).toThrow("1000");
    expect(() => normaliseDigestConfig({ name: "a", outro: "i".repeat(1001) })).toThrow("1000");
    expect(() => normaliseDigestConfig({ name: "a", override_text: "i".repeat(4001) })).toThrow("4000");
    expect(normaliseDigestConfig({ name: "a", override_text: "i".repeat(4000) }).override_text).toHaveLength(4000);
    expect(() => normaliseDigestConfig({ name: "a", intro: 5 })).toThrow();
  });
});

describe("requiredLoadEnd", () => {
  it("matches the built-in message when there is no config", () => {
    // next month's end (30 Nov) vs today + 8 weeks (6 Dec): the later wins.
    expect(requiredLoadEnd(SUN, [undefined])).toBe("2026-12-06");
  });
  it("covers the longest range and big-event window across digests", () => {
    const week = { ...DEFAULT_DIGEST_CONFIG, range_mode: "this_week" as const, include_big_events: false };
    expect(requiredLoadEnd(SUN, [week])).toBe(SUN);
    const days = { ...week, range_mode: "next_days" as const, range_days: 90 };
    expect(requiredLoadEnd(SUN, [week, days])).toBe("2027-01-08");
    const big = { ...week, include_big_events: true, big_lookahead_weeks: 26 };
    expect(requiredLoadEnd(SUN, [big])).toBe("2027-04-11");
  });
});

describe("isMissingDigestTable", () => {
  it("recognises a missing table and nothing else", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isMissingDigestTable({ code: "42P01" })).toBe(true);
    expect(isMissingDigestTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingDigestTable({ message: "Could not find the table 'public.telegram_digests' in the schema cache" })).toBe(true);
    expect(isMissingDigestTable({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingDigestTable(null)).toBe(false);
    quiet.mockRestore();
  });
});

describe("run status helpers (migration 030)", () => {
  const CLAIMED = "2026-10-11T11:30:00Z";
  const T_LATER = Date.parse("2026-10-11T12:30:00Z");
  const T_SOON = Date.parse("2026-10-11T11:35:00Z");

  it("a stale unconfirmed claim is due again, a fresh one or a confirmed one is not", () => {
    const claimed = { last_sent_on: SUN, last_status: null, last_attempt_at: CLAIMED };
    expect(isDueToday(row(claimed), SUN, T_LATER)).toBe(true);
    expect(isDueToday(row(claimed), SUN, T_SOON)).toBe(false);
    expect(isDueToday(row({ ...claimed, last_status: "sent" }), SUN, T_LATER)).toBe(false);
    expect(isDueToday(row({ ...claimed, last_status: "skipped" }), SUN, T_LATER)).toBe(false);
    expect(isDueToday(row({ ...claimed, last_status: "failed" }), SUN, T_SOON)).toBe(true);
  });

  it("without the status columns (undefined) a claim is final for the day", () => {
    expect(isDueToday(row({ last_sent_on: SUN }), SUN, T_LATER)).toBe(false);
    expect(hasUnfinishedClaim({ last_sent_on: SUN }, SUN, T_LATER)).toBe(false);
  });

  it("a null attempt time (manual send before the migration) is never stale", () => {
    expect(hasUnfinishedClaim({ last_sent_on: SUN, last_status: null, last_attempt_at: null }, SUN, T_LATER)).toBe(false);
  });

  it("nextSendLine: next, off and skipping", () => {
    expect(nextSendLine(row(), SUN)).toBe("Next send: Sun 11 Oct (around 7:30pm)");
    expect(nextSendLine(row({ last_sent_on: SUN, last_status: "sent" }), SUN)).toBe("Next send: Sun 18 Oct (around 7:30pm)");
    expect(nextSendLine(row({ enabled: false }), SUN)).toBe("Off \u2014 nothing will send");
    expect(nextSendLine(row({ skip_next: true }), SUN)).toBe("Skipping the next send (Sun 11 Oct), then Sun 18 Oct");
  });

  it("lastRunLine: sent, failed with retry ahead, failed with none, skipped, never", () => {
    const base = { last_sent_on: "2026-10-04", last_error: null, last_attempt_at: null, last_status: undefined } as const;
    expect(lastRunLine({ ...base, last_status: "sent" }, SUN)).toEqual({ text: "Last run: sent Sun 4 Oct", failed: false });
    expect(lastRunLine({ ...base, last_sent_on: null }, SUN)).toEqual({ text: "Not sent yet", failed: false });
    expect(lastRunLine({ ...base, last_status: "skipped" }, SUN)?.failed).toBe(false);
    const first = lastRunLine({ ...base, last_status: "failed", last_error: "Telegram refused the message", last_attempt_at: CLAIMED }, SUN, T_SOON)!;
    expect(first.failed).toBe(true);
    expect(first.text).toContain("FAILED: Telegram refused the message");
    expect(first.text).toContain("retry at about 8:30pm");
    const second = lastRunLine({ ...base, last_status: "failed", last_attempt_at: "2026-10-11T12:30:00Z" }, SUN, T_LATER)!;
    expect(second.text).toContain("Use Send now");
    expect(second.text).not.toContain("retry");
  });

  it("needsAttention only for enabled, failed digests", () => {
    expect(needsAttention({ enabled: true, last_status: "failed" })).toBe(true);
    expect(needsAttention({ enabled: false, last_status: "failed" })).toBe(false);
    expect(needsAttention({ enabled: true, last_status: "sent" })).toBe(false);
    expect(needsAttention({ enabled: true })).toBe(false);
  });
});
