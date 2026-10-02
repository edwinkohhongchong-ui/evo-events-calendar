"use client";

import { useEffect, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import EventCard from "./EventCard";
import DayNotes from "./DayNotes";
import { FlagIcon } from "./icons";
import { useHolidayPreview } from "./InfoPreviewCard";
import { DayData } from "@/lib/dayIndex";
import { todayStr, toDateStr } from "@/lib/dates";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { EventOccurrence, HolidayRow } from "@/lib/types";

interface DayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  isSunday: boolean;
  dayData: DayData | undefined;
  onDayClick: (dateStr: string) => void;
  onEventClick: (occurrence: EventOccurrence) => void;
  onHolidayClick: (holiday: HolidayRow) => void;
}

// Comfortably fits this many events before offering a "+N more" toggle —
// past this, showing everything by default made every row as tall as its
// single busiest day. Expanding one cell still grows the whole row (CSS
// Grid rows share one height across all 7 cells), which is the point: a
// packed day becomes visible without permanently squashing every other week.
const MAX_VISIBLE = 4;

export default function DayCell({
  day,
  isCurrentMonth,
  isSunday,
  dayData,
  onDayClick,
  onEventClick,
  onHolidayClick,
}: DayCellProps) {
  const dateStr = toDateStr(day);
  const dayNumber = day.getDate();
  const today = dateStr === todayStr();
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const [expanded, setExpanded] = useState(false);

  const occurrences = useMemo(() => dayData?.occurrences ?? [], [dayData]);

  // A notification link can point at an event hidden behind "+N more"
  // (see FocusHighlighter): open this day if that event is one of ours.
  useEffect(() => {
    function onReveal(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (occurrences.some((o) => o.event.id === id)) setExpanded(true);
    }
    window.addEventListener("evo:reveal-event", onReveal);
    return () => window.removeEventListener("evo:reveal-event", onReveal);
  }, [occurrences]);
  const hasOverflow = occurrences.length > MAX_VISIBLE;
  const showAll = expanded || !hasOverflow;

  return (
    <div
      ref={setNodeRef}
      data-date={dateStr}
      onClick={() => onDayClick(dateStr)}
      className={[
        "group/cell min-h-[160px] border-b border-r border-line [&:nth-child(7n)]:border-r-0 p-1.5 flex flex-col gap-1 cursor-pointer transition-[filter] duration-fast hover:brightness-[0.97]",
        !isCurrentMonth ? "bg-canvas" : isSunday ? "bg-gold-50" : "bg-surface",
        isOver ? "ring-2 ring-inset ring-navy !bg-navy-50" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap min-w-0">
        <Link
          href={`/day/${dateStr}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={today ? `${dayNumber} (today)` : undefined}
          title={today ? "Today" : undefined}
          className={[
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-chip leading-none hover:underline",
            today
              ? "bg-navy font-bold text-white ring-2 ring-gold ring-offset-1 ring-offset-surface"
              : isCurrentMonth
                ? "font-medium text-navy"
                : "font-normal text-ink-3/60",
          ].join(" ")}
        >
          {dayNumber}
        </Link>
        {dayData?.holidays.map((holiday) => (
          <HolidayLabel key={holiday.id} holiday={holiday} isCurrentMonth={isCurrentMonth} onHolidayClick={onHolidayClick} />
        ))}
      </div>

      <DayNotes dateStr={dateStr} notes={dayData?.dayNotes ?? []} />

      {occurrences.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {occurrences.map((occ, i) => (
            // Collapsed extras stay in the DOM but hidden on screen so a printout
            // lists every event (`.print-extra` in globals.css shows them; "+N more" is `.print-hide`).
            <div key={occurrenceKey(occ)} className={showAll || i < MAX_VISIBLE ? undefined : "hidden print-extra"}>
              <EventCard occurrence={occ} onClick={() => onEventClick(occ)} />
            </div>
          ))}
        </div>
      )}

      {hasOverflow && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="print-hide text-micro text-ink-2 hover:text-navy hover:underline text-left"
        >
          {expanded ? "Show less" : `+${occurrences.length - MAX_VISIBLE} more`}
        </button>
      )}
    </div>
  );
}

// Holiday label in a day cell: truncated text, full details in a hover/focus card.
function HolidayLabel({
  holiday,
  isCurrentMonth,
  onHolidayClick,
}: {
  holiday: HolidayRow;
  isCurrentMonth: boolean;
  onHolidayClick: (holiday: HolidayRow) => void;
}) {
  const { bind, card, hide } = useHolidayPreview(holiday);
  return (
    <>
      <button
        type="button"
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          hide();
          onHolidayClick(holiday);
        }}
        aria-label={`${holiday.name}, ${holiday.type}`}
        className={[
          "inline-flex max-w-full min-w-0 items-center gap-0.5 text-micro hover:underline",
          isCurrentMonth ? "text-ink-2" : "text-ink-3/60",
        ].join(" ")}
      >
        <FlagIcon className="!h-3 !w-3 text-danger/70" />
        <span className="truncate">{holiday.name}</span>
      </button>
      {card}
    </>
  );
}
