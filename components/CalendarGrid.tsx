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
  /** Freeze the weekday row under the sticky month bar (live calendar only; never in print views). */
  stickyHeader?: boolean;
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
  stickyHeader = false,
}: CalendarGridProps) {
  return (
    // overflow-clip (not hidden) keeps the rounded corners without creating a
    // scroll container, which would break the sticky weekday row below.
    <div className="print-grid border border-line bg-surface rounded-card [overflow:clip]">
      <div
        className={[
          "print-dow grid grid-cols-7 bg-surface border-b border-line text-micro font-medium text-ink-2",
          // Sticks just under the month bar (CalendarHeader publishes its height as
          // --month-bar-h; 1px overlap hides any subpixel seam). z-20 < bar's z-30,
          // > day cells/chips (unstacked). Static in print and while html.printing.
          stickyHeader ? "sticky top-[calc(var(--nav-h,50px)+var(--month-bar-h,56px)-2px)] z-20 print:static" : "",
        ].join(" ")}
      >
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
