import { getMonthGrid } from "@/lib/calendar";
import { getCalendarData, getMonthFocus } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { computeSeasonSegments } from "@/lib/seasonBars";
import { toDateStr } from "@/lib/dates";
import CalendarBoard from "@/components/CalendarBoard";
import FocusPanel from "@/components/FocusPanel";
import CategoryListView from "@/components/CategoryListView";

// This is a live, mutable calendar (drag-and-drop, add/edit/delete) — every
// render must hit Supabase fresh. Without this, Next.js's default fetch
// cache serves stale data for a previously-visited ?year=&month= URL even
// after a successful write (confirmed: DB updates, but a revisited/refreshed
// page kept rendering the pre-write state).
export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: { year?: string; month?: string };
}

export default async function Home({ searchParams }: HomeProps) {
  const now = new Date();
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Number(searchParams.month) || now.getMonth() + 1;

  const { monthStart, gridStart, gridEnd, weeks } = getMonthGrid(year, month);
  const gridStartStr = toDateStr(gridStart);
  const gridEndStr = toDateStr(gridEnd);

  const [{ events, holidays, seasons, overrides, levels, exceptions }, monthFocus] = await Promise.all([
    getCalendarData(gridStartStr, gridEndStr),
    getMonthFocus(year, month),
  ]);
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const exceptionsByEventId = new Map<string, Set<string>>();
  for (const exception of exceptions) {
    const set = exceptionsByEventId.get(exception.event_id) ?? new Set<string>();
    set.add(exception.original_date);
    exceptionsByEventId.set(exception.event_id, set);
  }
  const rawOccurrences = expandEvents(events, gridStart, gridEnd, exceptionsByEventId);
  const occurrences = applyOverrides(rawOccurrences, overrides, eventsById, gridStartStr, gridEndStr);
  const seasonSegmentsByWeek = computeSeasonSegments(seasons, weeks, gridStart, gridEnd);

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <FocusPanel key={`${year}-${month}`} year={year} month={month} monthFocus={monthFocus} />
      <CalendarBoard
        weeks={weeks}
        monthStart={monthStart}
        occurrences={occurrences}
        holidays={holidays}
        seasonSegmentsByWeek={seasonSegmentsByWeek}
        levels={levels}
      />
      <CategoryListView occurrences={occurrences} levels={levels} defaultAddDate={toDateStr(monthStart)} />
    </main>
  );
}
