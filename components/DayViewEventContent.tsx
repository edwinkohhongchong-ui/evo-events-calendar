import { EventOccurrence } from "@/lib/types";
import { LEVEL_CHIP_CLASSES } from "@/lib/constants";
import { useLevelColor } from "@/lib/levelColorContext";
import { formatEventTimeRange } from "@/lib/dates";
import { endsNextDay } from "@/lib/timeMath";

export default function DayViewEventContent({ occurrence }: { occurrence: EventOccurrence }) {
  const { event } = occurrence;
  const colorKey = useLevelColor(event.level);
  const time = formatEventTimeRange(occurrence.startTime, occurrence.endTime);
  const nextDay =
    !!occurrence.startTime &&
    !!occurrence.endTime &&
    endsNextDay(occurrence.startTime, occurrence.endTime);
  const subtitle =
    event.event_type === "Gathering" ? [event.series, event.sermon_title].filter(Boolean).join(" — ") : "";

  return (
    <div
      className={[
        "h-full overflow-hidden rounded-chip py-0.5 pl-2 pr-1.5 text-chip",
        LEVEL_CHIP_CLASSES[colorKey],
      ].join(" ")}
      title={[event.name, subtitle].filter(Boolean).join(" — ")}
    >
      <div className="font-medium truncate">{event.name}</div>
      {subtitle && <div className="truncate text-ink-2">{subtitle}</div>}
      {time && (
        <div className="truncate text-ink-2">
          {time}
          {nextDay && <span className="ml-1">(next day)</span>}
          {occurrence.isOverridden && <span className="ml-1">(moved)</span>}
        </div>
      )}
    </div>
  );
}
