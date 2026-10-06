"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, format, subMonths } from "date-fns";
import EventCardContent from "./EventCardContent";
import { FlagIcon } from "./icons";
import { DetailsMarker } from "./ui/DetailsText";
import { DayData } from "@/lib/dayIndex";
import { SeasonSegment } from "@/lib/seasonBars";
import { resolveSeasonColor } from "@/lib/seasonColor";
import { seasonBarStyle } from "@/lib/colorStyle";
import { parseDateStr, todayStr, toDateStr } from "@/lib/dates";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { useEventSearch } from "@/lib/eventSearchContext";
import { EventOccurrence, HolidayRow, SeasonRow } from "@/lib/types";

interface MonthAgendaProps {
  monthStart: Date;
  days: Date[];
  dayIndex: Map<string, DayData>;
  occurrences: EventOccurrence[];
  seasonSegmentsByWeek: SeasonSegment[][];
  onEventClick: (occurrence: EventOccurrence) => void;
  onHolidayClick: (holiday: HolidayRow) => void;
  onSeasonClick: (season: SeasonRow) => void;
  // Editors only: when set, each day row shows a "+" that quick-adds on that date.
  onAddClick?: (date: string) => void;
}

// Phone-width alternative to the 7-column month grid (which would be ~50px
// per column): a vertical list of the days in this month that have something
// on them. Tap an event to open it, tap the date to open that day's page.
// No drag-and-drop here — rescheduling on a phone is done from the event form.
export default function MonthAgenda({
  monthStart,
  days,
  dayIndex,
  occurrences,
  seasonSegmentsByWeek,
  onEventClick,
  onHolidayClick,
  onSeasonClick,
  onAddClick,
}: MonthAgendaProps) {
  const router = useRouter();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const month = monthStart.getMonth();
  // While searching, the agenda lists only matching events (no room to dim on a phone).
  const { active: searching, matchedIds } = useEventSearch();

  // Horizontal swipe changes month (the arrows remain the fallback).
  function goTo(d: Date) {
    router.push(`/?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  }
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    goTo(dx < 0 ? addMonths(monthStart, 1) : subMonths(monthStart, 1));
  }
  const multiDay = occurrences.filter((o) => o.spanEndDate !== o.occurrenceDate && (!searching || matchedIds.has(o.event.id)));

  const seasons = new Map<string, SeasonRow>();
  for (const week of seasonSegmentsByWeek) for (const seg of week) seasons.set(seg.season.id, seg.season);

  const rows = days
    .filter((d) => d.getMonth() === month)
    .map((d) => {
      const dateStr = toDateStr(d);
      const data = dayIndex.get(dateStr);
      const spanning = multiDay.filter((o) => o.occurrenceDate <= dateStr && dateStr <= o.spanEndDate);
      const events = (data?.occurrences ?? []).filter((o) => !searching || matchedIds.has(o.event.id));
      return { d, dateStr, holidays: searching ? [] : data?.holidays ?? [], events, spanning };
    })
    .filter((r) => r.holidays.length || r.events.length || r.spanning.length);

  return (
    <div className="flex flex-col gap-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {seasons.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(seasons.values()).map((season) => {
            const bar = seasonBarStyle(resolveSeasonColor(season));
            return (
              <button
                key={season.id}
                type="button"
                onClick={() => onSeasonClick(season)}
                className={`max-w-full truncate rounded-pill border px-2.5 py-0.5 text-micro ${bar.className}`}
                style={bar.style}
              >
                {season.name}
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-card bg-surface p-4 text-center text-body text-ink-2">{searching ? "No matching events this month." : "Nothing scheduled this month."}</p>
      )}

      {rows.map(({ d, dateStr, holidays, events, spanning }) => {
        const today = dateStr === todayStr();
        return (
          <div key={dateStr} className="flex gap-3 rounded-card border border-line bg-surface p-3">
            <Link
              href={`/day/${dateStr}`}
              aria-label={`Open ${format(parseDateStr(dateStr), "EEEE d MMMM")}`}
              className={[
                "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-ctl leading-tight",
                today ? "bg-navy text-white" : d.getDay() === 0 ? "bg-gold-50 text-navy" : "bg-fill text-navy",
              ].join(" ")}
            >
              <span className="text-micro font-medium uppercase">{format(d, "EEE")}</span>
              <span className="text-ui font-semibold">{d.getDate()}</span>
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {holidays.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onHolidayClick(h)}
                  className="inline-flex items-center gap-1 self-start text-left text-body text-ink-2"
                >
                  <FlagIcon className="!h-3.5 !w-3.5 text-danger/70" />
                  {h.name}
                  {h.details && <DetailsMarker />}
                </button>
              ))}
              {[...spanning, ...events].map((occ) => (
                <button
                  key={occurrenceKey(occ) + dateStr}
                  type="button"
                  onClick={() => onEventClick(occ)}
                  className="block w-full text-left"
                >
                  <EventCardContent occurrence={occ} />
                </button>
              ))}
            </div>
            {onAddClick && (
              <button
                type="button"
                onClick={() => onAddClick(dateStr)}
                aria-label={`Add event on ${format(parseDateStr(dateStr), "EEEE d MMMM")}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl bg-fill text-xl font-semibold leading-none text-navy"
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
