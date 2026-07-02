import { EventOccurrence } from "@/lib/types";
import { LEVEL_COLORS } from "@/lib/constants";
import { formatEventTimeRange } from "@/lib/dates";
import { endsNextDay } from "@/lib/timeMath";

export default function DayViewEventContent({ occurrence }: { occurrence: EventOccurrence }) {
  const { event } = occurrence;
  const time = formatEventTimeRange(occurrence.startTime, occurrence.endTime);
  const nextDay =
    !!occurrence.startTime &&
    !!occurrence.endTime &&
    endsNextDay(occurrence.startTime, occurrence.endTime);

  return (
    <div
      className={["h-full rounded border px-2 py-0.5 text-xs overflow-hidden", LEVEL_COLORS[event.level]].join(
        " "
      )}
      title={event.name}
    >
      <div className="font-medium truncate">{event.name}</div>
      {time && (
        <div className="truncate opacity-80">
          {time}
          {nextDay && <span className="ml-1 opacity-70">(next day)</span>}
          {occurrence.isOverridden && <span className="ml-1 opacity-70">(moved)</span>}
        </div>
      )}
    </div>
  );
}
