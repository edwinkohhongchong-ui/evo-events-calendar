"use client";

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

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick(dateStr)}
      className={[
        "min-h-[120px] border border-gray-200 p-1.5 flex flex-col gap-1 cursor-pointer",
        isCurrentMonth ? "bg-white" : "bg-gray-50",
        isSunday && isCurrentMonth ? "bg-gold/10" : "",
        isOver ? "ring-2 ring-inset ring-gold" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <Link
          href={`/day/${dateStr}`}
          onClick={(e) => e.stopPropagation()}
          className={[
            "text-xs font-medium leading-none hover:underline",
            isCurrentMonth ? "text-navy" : "text-gray-400",
            today ? "flex items-center justify-center w-5 h-5 rounded-full bg-navy text-white" : "",
          ].join(" ")}
        >
          {dayNumber}
        </Link>
      </div>

      {dayData && dayData.holidays.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {dayData.holidays.map((holiday) => (
            <span
              key={holiday.id}
              className="text-[11px] leading-tight px-1 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 truncate"
              title={holiday.name}
            >
              {holiday.name}
            </span>
          ))}
        </div>
      )}

      {dayData && dayData.occurrences.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {dayData.occurrences.map((occ) => (
            <EventCard key={occurrenceKey(occ)} occurrence={occ} onClick={() => onEventClick(occ)} />
          ))}
        </div>
      )}
    </div>
  );
}
