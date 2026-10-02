import { createCalendarificLoader, nationalHolidays } from "../calendarificApi";
import type { CalendarificResult } from "../calendarificApi";
import { checkHolidays } from "./holidayCheck";
import type { HolidayCheck } from "./holidayCheck";
import type { SchedulePlan } from "./planRows";

export const CHECK_TIMEOUT_MS = 4000;

const SOURCE = "Calendarific" as const;
const UNAVAILABLE_FALLBACK = "something went wrong while checking";

/**
 * Looks the document's public holidays up in Calendarific (the document year, plus the next
 * year when a holiday falls in it) and compares. Never throws and never fails the parse: any
 * problem comes back as `status: "unavailable"` with a plain-language message.
 */
export async function runHolidayCheck(
  plan: Pick<SchedulePlan, "docYear" | "holidays">,
  load: (year: number) => Promise<CalendarificResult> = createCalendarificLoader({ timeoutMs: CHECK_TIMEOUT_MS })
): Promise<HolidayCheck> {
  try {
    if (plan.holidays.length === 0) return { status: "ok", source: SOURCE, rows: [], notInDocument: [] };

    const year = plan.docYear ?? Number(plan.holidays[0].start.slice(0, 4));
    const needNext = plan.holidays.some((h) => Number(h.start.slice(0, 4)) === year + 1);

    const first = await load(year);
    if (!first.ok) return { status: "unavailable", source: SOURCE, message: first.message };
    const loadedYears = [year];
    let list = nationalHolidays(first.holidays);

    if (needNext) {
      const next = await load(year + 1);
      // A failed second year only leaves that year's holidays unchecked.
      if (next.ok) {
        loadedYears.push(year + 1);
        list = [...list, ...nationalHolidays(next.holidays)];
      }
    }

    const { rows, notInDocument } = checkHolidays(
      plan.holidays.map((h) => ({ rowId: h.rowId, name: h.name, start: h.start })),
      list,
      { loadedYears, listYear: year }
    );
    return { status: "ok", source: SOURCE, rows, notInDocument };
  } catch {
    return { status: "unavailable", source: SOURCE, message: UNAVAILABLE_FALLBACK };
  }
}
