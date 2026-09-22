import { EventOccurrence } from "@/lib/types";
import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { useLevelColor } from "@/lib/levelColorContext";
import { formatEventTimeRange } from "@/lib/dates";
import { endsNextDay } from "@/lib/timeMath";

export default function EventCardContent({ occurrence }: { occurrence: EventOccurrence }) {
  const { event } = occurrence;
  const colorKey = useLevelColor(event.level);
  // Effective time (post-override), not event.event_time/event.end_time
  // directly — a time override from day-view must show here too.
  const time = formatEventTimeRange(occurrence.startTime, occurrence.endTime);
  const nextDay =
    !!occurrence.startTime &&
    !!occurrence.endTime &&
    endsNextDay(occurrence.startTime, occurrence.endTime);

  return (
    <div
      className={[
        "text-[13px] leading-tight px-1 py-0.5 rounded border truncate",
        LEVEL_COLOR_CLASSES[colorKey],
      ].join(" ")}
      title={event.name}
    >
      {time && <span className="font-medium">{time} </span>}
      {event.name}
      {nextDay && <span className="ml-1 text-[10px] opacity-70">(next day)</span>}
      {occurrence.isOverridden && <span className="ml-1 text-[10px] opacity-70">(moved)</span>}
    </div>
  );
}
