import { isToday } from "date-fns";
import { DayData } from "@/lib/dayIndex";
import { LEVEL_COLORS } from "@/lib/constants";
import { formatEventTime } from "@/lib/dates";

interface DayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  isSunday: boolean;
  dayData: DayData | undefined;
}

export default function DayCell({ day, isCurrentMonth, isSunday, dayData }: DayCellProps) {
  const dayNumber = day.getDate();
  const today = isToday(day);

  return (
    <div
      className={[
        "min-h-[120px] border border-gray-200 p-1.5 flex flex-col gap-1",
        isCurrentMonth ? "bg-white" : "bg-gray-50",
        isSunday && isCurrentMonth ? "bg-gold/10" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            "text-xs font-medium leading-none",
            isCurrentMonth ? "text-navy" : "text-gray-400",
            today ? "flex items-center justify-center w-5 h-5 rounded-full bg-navy text-white" : "",
          ].join(" ")}
        >
          {dayNumber}
        </span>
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

      {dayData && dayData.seasons.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {dayData.seasons.map((season) => (
            <span
              key={season.id}
              className="text-[11px] leading-tight px-1 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 truncate"
              title={season.name}
            >
              {season.name}
            </span>
          ))}
        </div>
      )}

      {dayData && dayData.occurrences.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {dayData.occurrences.map(({ event, occurrenceDate }) => {
            const time = formatEventTime(event.event_time);
            return (
              <div
                key={`${event.id}-${occurrenceDate}`}
                className={[
                  "text-[13px] leading-tight px-1 py-0.5 rounded border truncate",
                  LEVEL_COLORS[event.level],
                ].join(" ")}
                title={event.name}
              >
                {time && <span className="font-medium">{time} </span>}
                {event.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
