import { EventOccurrence } from "@/lib/types";
import { LEVEL_COLORS } from "@/lib/constants";
import { formatEventTime } from "@/lib/dates";

export default function EventCardContent({ occurrence }: { occurrence: EventOccurrence }) {
  const { event } = occurrence;
  const time = formatEventTime(event.event_time);

  return (
    <div
      className={[
        "text-[13px] leading-tight px-1 py-0.5 rounded border truncate",
        LEVEL_COLORS[event.level],
      ].join(" ")}
      title={event.name}
    >
      {time && <span className="font-medium">{time} </span>}
      {event.name}
      {occurrence.isOverridden && <span className="ml-1 text-[10px] opacity-70">(moved)</span>}
    </div>
  );
}
