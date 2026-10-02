import { isSameMonth } from "date-fns";
import DayCell from "./DayCell";
import SeasonBarRow from "./SeasonBarRow";
import EventBarRow from "./EventBarRow";
import { DayData } from "@/lib/dayIndex";
import { SeasonSegment } from "@/lib/seasonBars";
import { EventBarSegment } from "@/lib/eventBars";
import { toDateStr } from "@/lib/dates";
import { EventOccurrence, HolidayRow, SeasonRow } from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarGridProps {
  weeks: Date[][];
  monthStart: Date;
  dayIndex: Map<string, DayData>;
  seasonSegmentsByWeek: SeasonSegment[][];
  eventSegmentsByWeek: EventBarSegment[][];
  onDayClick: (dateStr: string) => void;
  onEventClick: (occurrence: EventOccurrence) => void;
  onHolidayClick: (holiday: HolidayRow) => void;
  onSeasonClick: (season: SeasonRow) => void;
}

export default function CalendarGrid({
  weeks,
  monthStart,
  dayIndex,
  seasonSegmentsByWeek,
  eventSegmentsByWeek,
  onDayClick,
  onEventClick,
  onHolidayClick,
  onSeasonClick,
}: CalendarGridProps) {
  return (
    <div className="print-grid border border-line bg-surface rounded-card overflow-hidden">
      <div className="print-dow grid grid-cols-7 bg-surface border-b border-line text-micro font-medium text-ink-2">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={["py-1 text-center", i === 6 ? "bg-gold-50 text-ink" : ""].join(" ")}
          >
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx} className="print-week">
          <SeasonBarRow segments={seasonSegmentsByWeek[weekIdx] ?? []} onSeasonClick={onSeasonClick} />
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
                  onHolidayClick={onHolidayClick}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
