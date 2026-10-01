import { addDays, subDays, format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDayViewData } from "@/lib/data";
import { expandEvents } from "@/lib/recurrence";
import { applyOverrides } from "@/lib/overrides";
import { isValidDateStr, parseDateStr, toDateStr, formatDateDisplay } from "@/lib/dates";
import DayView from "@/components/DayView";
import { buttonClass } from "@/components/ui/Button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// Same live-data reasoning as the month view — see app/page.tsx.
export const dynamic = "force-dynamic";

interface DayPageProps {
  params: { date: string }; // yyyy-MM-dd
}

export default async function DayPage({ params }: DayPageProps) {
  const dateStr = params.date;
  if (!isValidDateStr(dateStr)) notFound();
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
        <Link
          href={`/?year=${year}&month=${month}`}
          className="inline-flex items-center gap-1 rounded-pill py-1 pr-2 text-body font-medium text-navy hover:underline"
        >
          <ChevronLeftIcon className="!h-4 !w-4" />
          {format(date, "MMMM yyyy")}
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/day/${prevDateStr}`} className={buttonClass("secondary", "sm", "pl-2.5")}>
            <ChevronLeftIcon className="!h-4 !w-4" />
            Prev
          </Link>
          <Link href={`/day/${nextDateStr}`} className={buttonClass("secondary", "sm", "pr-2.5")}>
            Next
            <ChevronRightIcon className="!h-4 !w-4" />
          </Link>
        </div>
      </div>
      <h1 className="text-title sm:text-display text-navy mb-4">
        {format(date, "EEEE")}, {formatDateDisplay(dateStr)}
      </h1>
      <DayView occurrences={occurrences} levels={levels} />
    </main>
  );
}
