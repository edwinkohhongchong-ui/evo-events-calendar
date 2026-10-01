// Registry of "automated check" rules for checklist items — see migration
// 022 and ChecklistRow.auto_check_type in lib/types.ts. Each rule is a
// small, explicit, reliable check a person opts an item into from a
// dropdown (ChecklistModal) — this is NOT free-text/NLP interpretation of
// the item's title. Adding a second check type later should be a one-line
// registry addition plus a new function, not a rewrite.

import { ChecklistAutoCheckType, ChecklistRow, SeasonRow, TargetMonth } from "./types";
import { TARGET_MONTHS } from "./constants";
import { todayDate } from "./dates";

export interface AutoCheckResult {
  ok: boolean;
  note: string;
}

export interface AutoCheckContext {
  seasons: SeasonRow[];
}

export type AutoCheckFn = (item: ChecklistRow, context: AutoCheckContext) => Promise<AutoCheckResult>;

// Resolves a TargetMonth to the concrete calendar year it refers to: if that
// month hasn't happened yet this year, it means this year; if it has already
// passed, it means next year. No existing helper for this was found
// elsewhere in the codebase (checked lib/data.ts, lib/dates.ts, the
// Reminders/Month Focus code) — this is the one place it lives for now.
// Exported (beyond the AUTO_CHECKS registry itself) so tests can inject a
// fixed `now` and assert the year-resolution logic deterministically.
export function resolveTargetMonthYear(targetMonth: TargetMonth, now: Date = todayDate()): number {
  const monthIndex = TARGET_MONTHS.indexOf(targetMonth); // 0-based, Jan = 0
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  return monthIndex >= currentMonthIndex ? currentYear : currentYear + 1;
}

function monthFullRange(monthIndex: number, year: number): { start: Date; end: Date } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0); // last day of month
  return { start, end };
}

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

const MONTH_NAMES: Record<TargetMonth, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

async function checkSchoolHolidaysPresent(
  item: ChecklistRow,
  context: AutoCheckContext
): Promise<AutoCheckResult> {
  // No target_month means there's no month to check overlap against — skip
  // silently rather than flagging an item that was never set up to use this
  // check properly.
  if (!item.target_month) {
    return { ok: true, note: "" };
  }

  const monthIndex = TARGET_MONTHS.indexOf(item.target_month);
  const year = resolveTargetMonthYear(item.target_month);
  const { start, end } = monthFullRange(monthIndex, year);

  const hasMatch = context.seasons.some((season) => {
    if (season.category !== "School Schedule") return false;
    const seasonStart = parseDateOnly(season.start_date);
    const seasonEnd = parseDateOnly(season.end_date);
    return rangesOverlap(start, end, seasonStart, seasonEnd);
  });

  if (hasMatch) {
    return { ok: true, note: "" };
  }

  return {
    ok: false,
    note: `⚠ No school holiday/term season found covering ${MONTH_NAMES[item.target_month]} ${year} — check the Seasons tab.`,
  };
}

export const AUTO_CHECKS: Record<ChecklistAutoCheckType, AutoCheckFn> = {
  school_holidays_present: checkSchoolHolidaysPresent,
};
