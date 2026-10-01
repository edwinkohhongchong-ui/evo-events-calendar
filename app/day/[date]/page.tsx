import { addDays, subDays, format } from "date-fns";
import Link from "next/link";
import { getDayViewData } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { parseDateStr, toDateStr, formatDateDisplay } from "@/lib/dates";
import DayView from "@/components/DayView";

// Same live-data reasoning as the month view — see app/page.tsx.
export const dynamic = "force-dynamic";

interface DayPageProps {
  params: { date: string }; // yyyy-MM-dd
}

export default async function DayPage({ params }: DayPageProps) {
  const dateStr = params.date;
  const date = parseDateStr(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const { events, overrides, levels, exceptions } = await getDayViewData(dateStr);
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const exceptionsByEventId = new Map<string, Set<string>>();
  for (const exception of exceptions) {
    const set = exceptionsByEventId.get(exception.event_id) ?? new Set<string>();
    set.add(exception.original_date);
    exceptionsByEventId.set(exception.event_id, set);
  }
  const rawOccurrences = expandEvents(events, date, date, exceptionsByEventId);
  const occurrences = applyOverrides(rawOccurrences, overrides, eventsById, dateStr, dateStr);

  const prevDateStr = toDateStr(subDays(date, 1));
  const nextDateStr = toDateStr(addDays(date, 1));

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <Link href={`/?year=${year}&month=${month}`} className="text-sm text-navy hover:underline">
          ← {format(date, "MMMM yyyy")}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/day/${prevDateStr}`}
            className="px-2.5 py-1 rounded border border-gray-300 text-sm text-navy"
          >
            ← Prev
          </Link>
          <Link
            href={`/day/${nextDateStr}`}
            className="px-2.5 py-1 rounded border border-gray-300 text-sm text-navy"
          >
            Next →
          </Link>
        </div>
      </div>
      <h1 className="text-xl font-semibold text-navy mb-4">
        {format(date, "EEEE")}, {formatDateDisplay(dateStr)}
      </h1>
      <DayView occurrences={occurrences} levels={levels} />
    </main>
  );
}
