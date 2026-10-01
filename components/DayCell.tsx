"use client";

import { useState } from "react";
import { isToday } from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import EventCard from "./EventCard";
import DayNotes from "./DayNotes";
import { FlagIcon } from "./icons";
import { DayData } from "@/lib/dayIndex";
import { toDateStr } from "@/lib/dates";
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
  const today = isToday(day);
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });
  const [expanded, setExpanded] = useState(false);

  const occurrences = dayData?.occurrences ?? [];
  const hasOverflow = occurrences.length > MAX_VISIBLE;
  const visibleOccurrences = expanded || !hasOverflow ? occurrences : occurrences.slice(0, MAX_VISIBLE);

  return (
    <div
      ref={setNodeRef}
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
          <button
            key={holiday.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHolidayClick(holiday);
            }}
            className={[
              "inline-flex max-w-full min-w-0 items-center gap-0.5 text-micro hover:underline",
              isCurrentMonth ? "text-ink-2" : "text-ink-3/60",
            ].join(" ")}
            title={`Edit "${holiday.name}"`}
          >
            <FlagIcon className="!h-3 !w-3 text-danger/70" />
            <span className="truncate">{holiday.name}</span>
          </button>
        ))}
      </div>

      <DayNotes dateStr={dateStr} notes={dayData?.dayNotes ?? []} />

      {visibleOccurrences.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {visibleOccurrences.map((occ) => (
            <EventCard key={occurrenceKey(occ)} occurrence={occ} onClick={() => onEventClick(occ)} />
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
          className="text-micro text-ink-2 hover:text-navy hover:underline text-left"
        >
          {expanded ? "Show less" : `+${occurrences.length - MAX_VISIBLE} more`}
        </button>
      )}
    </div>
  );
}
