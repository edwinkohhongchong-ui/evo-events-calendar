import Link from "next/link";
import { getMonthGrid } from "@/lib/calendar";
import { getCalendarData, getEventChecklistProgress } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { computeSeasonSegments } from "@/lib/seasonBars";
import { formatDateDisplay, todayStr, toDateStr } from "@/lib/dates";
import { parseMonthsParam } from "@/lib/printMonths";
import PrintCalendar, { type PrintMonthData } from "@/components/PrintCalendar";

// Live data, same as the month page.
export const dynamic = "force-dynamic";

export const metadata = { title: "Print Calendar" };

export default async function PrintCalendarPage({ searchParams }: { searchParams: { months?: string | string[] } }) {
  const parsed = parseMonthsParam(searchParams.months);
  if (!parsed.ok) {
    return (
      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-navy mb-2">Print Calendar</h1>
        <p className="text-body text-ink-2 mb-4">{parsed.error} Pick the months to print on the Export page.</p>
        <Link href="/export" className="text-body font-medium text-navy hover:underline">
          Back to Export
        </Link>
      </main>
    );
  }

  const grids = parsed.months.map((m) => ({ key: m.key, ...getMonthGrid(m.year, m.month) }));
  const rangeStart = grids.reduce((a, g) => (g.gridStart < a ? g.gridStart : a), grids[0].gridStart);
  const rangeEnd = grids.reduce((a, g) => (g.gridEnd > a ? g.gridEnd : a), grids[0].gridEnd);

  // One fetch covering every selected month's grid; each month is then sliced
  // out below exactly the way app/page.tsx builds a single month.
  const { events, holidays, seasons, overrides, levels, exceptions, dayNotes } = await getCalendarData(
    toDateStr(rangeStart),
    toDateStr(rangeEnd)
  );
  const checklistProgress = await getEventChecklistProgress(events.map((e) => e.id));

  const eventsById = new Map(events.map((e) => [e.id, e]));
  const exceptionsByEventId = new Map<string, Set<string>>();
  for (const exception of exceptions) {
    const set = exceptionsByEventId.get(exception.event_id) ?? new Set<string>();
    set.add(exception.original_date);
    exceptionsByEventId.set(exception.event_id, set);
  }

  const months: PrintMonthData[] = grids.map(({ key, monthStart, gridStart, gridEnd, weeks }) => {
    const startStr = toDateStr(gridStart);
    const endStr = toDateStr(gridEnd);
    const raw = expandEvents(events, gridStart, gridEnd, exceptionsByEventId);
    return {
      key,
      monthStart,
      weeks,
      occurrences: applyOverrides(raw, overrides, eventsById, startStr, endStr),
      holidays: holidays.filter((h) => h.holiday_date >= startStr && h.holiday_date <= endStr),
      dayNotes: dayNotes.filter((n) => n.note_date >= startStr && n.note_date <= endStr),
      seasonSegmentsByWeek: computeSeasonSegments(seasons, weeks, gridStart, gridEnd),
    };
  });

  return (
    <PrintCalendar
      months={months}
      levels={levels}
      checklistProgress={checklistProgress}
      printedOn={formatDateDisplay(todayStr())}
    />
  );
}
