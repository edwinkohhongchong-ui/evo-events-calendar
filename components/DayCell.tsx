"use client";

import { useState } from "react";
import { isToday } from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import EventCard from "./EventCard";
import { DayData } from "@/lib/dayIndex";
import { toDateStr } from "@/lib/dates";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { EventOccurrence } from "@/lib/types";

interface DayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  isSunday: boolean;
  dayData: DayData | undefined;
  onDayClick: (dateStr: string) => void;
  onEventClick: (occurrence: EventOccurrence) => void;
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
        "min-h-[160px] border border-gray-200 p-1.5 flex flex-col gap-1 cursor-pointer",
        isCurrentMonth ? "bg-white" : "bg-gray-50",
        isSunday && isCurrentMonth ? "bg-gold/10" : "",
        isOver ? "ring-2 ring-inset ring-gold" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <Link
          href={`/day/${dateStr}`}
          onClick={(e) => e.stopPropagation()}
          className={[
            "text-xs font-medium leading-none hover:underline shrink-0",
            isCurrentMonth ? "text-navy" : "text-gray-400",
            today ? "flex items-center justify-center w-5 h-5 rounded-full bg-navy text-white" : "",
          ].join(" ")}
        >
          {dayNumber}
        </Link>
        {dayData?.holidays.map((holiday) => (
          <span
            key={holiday.id}
            className="text-[11px] font-medium text-red-600 truncate"
            title={holiday.name}
          >
            {holiday.name}
          </span>
        ))}
      </div>

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
          className="text-[11px] text-navy hover:underline text-left"
        >
          {expanded ? "Show less" : `+${occurrences.length - MAX_VISIBLE} more`}
        </button>
      )}
    </div>
  );
}
