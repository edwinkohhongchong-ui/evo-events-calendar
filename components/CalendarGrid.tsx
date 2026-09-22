import { isSameMonth } from "date-fns";
import DayCell from "./DayCell";
import SeasonBarRow from "./SeasonBarRow";
import EventBarRow from "./EventBarRow";
import { DayData } from "@/lib/dayIndex";
import { SeasonSegment } from "@/lib/seasonBars";
import { EventBarSegment } from "@/lib/eventBars";
import { toDateStr } from "@/lib/dates";
import { EventOccurrence } from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarGridProps {
  weeks: Date[][];
  monthStart: Date;
  dayIndex: Map<string, DayData>;
  seasonSegmentsByWeek: SeasonSegment[][];
  eventSegmentsByWeek: EventBarSegment[][];
  onDayClick: (dateStr: string) => void;
  onEventClick: (occurrence: EventOccurrence) => void;
}

export default function CalendarGrid({
  weeks,
  monthStart,
  dayIndex,
  seasonSegmentsByWeek,
  eventSegmentsByWeek,
  onDayClick,
  onEventClick,
}: CalendarGridProps) {
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="grid grid-cols-7 bg-navy text-white text-xs font-semibold">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={["py-1.5 text-center", i === 6 ? "bg-gold/30" : ""].join(" ")}
          >
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx}>
          <SeasonBarRow segments={seasonSegmentsByWeek[weekIdx] ?? []} />
          <EventBarRow segments={eventSegmentsByWeek[weekIdx] ?? []} onEventClick={onEventClick} />
          <div className="grid grid-cols-7">
            {week.map((day) => {
              const dateStr = toDateStr(day);
              return (
                <DayCell
                  key={dateStr}
                  day={day}
                  isCurrentMonth={isSameMonth(day, monthStart)}
                  isSunday={day.getDay() === 0}
                  dayData={dayIndex.get(dateStr)}
                  onDayClick={onDayClick}
                  onEventClick={onEventClick}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
