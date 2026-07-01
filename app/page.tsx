import { getMonthGrid } from "@/lib/calendar";
import { getCalendarData } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { buildDayIndex } from "@/lib/dayIndex";
import { toDateStr } from "@/lib/dates";
import CalendarHeader from "@/components/CalendarHeader";
import CalendarGrid from "@/components/CalendarGrid";

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

  const { events, holidays, seasons } = await getCalendarData(gridStartStr, gridEndStr);
  const occurrences = expandEvents(events, gridStart, gridEnd);
  const dayIndex = buildDayIndex(weeks.flat(), occurrences, holidays, seasons);

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <CalendarHeader monthStart={monthStart} />
      <CalendarGrid weeks={weeks} monthStart={monthStart} dayIndex={dayIndex} />
    </main>
  );
}
