import { EventOccurrence } from "@/lib/types";
import { LEVEL_CHIP_CLASSES } from "@/lib/constants";
import { useLevelColor } from "@/lib/levelColorContext";
import { formatEventTimeRange } from "@/lib/dates";
import { endsNextDay } from "@/lib/timeMath";
import { useEventChecklistProgress } from "@/lib/eventChecklistContext";
import { progressOverdue } from "@/lib/eventChecklist";
import { toDateStr } from "@/lib/dates";

export default function EventCardContent({
  occurrence,
  lifted = false,
}: {
  occurrence: EventOccurrence;
  /** True for the drag overlay: subtle lift (shadow + slight scale). */
  lifted?: boolean;
}) {
  const { event } = occurrence;
  const colorKey = useLevelColor(event.level);
  const checklist = useEventChecklistProgress(event.id);
  const checklistOverdue = checklist ? progressOverdue(checklist, event.event_date, toDateStr(new Date())) : false;
  // Effective time (post-override), not event.event_time/event.end_time
  // directly — a time override from day-view must show here too.
  const time = formatEventTimeRange(occurrence.startTime, occurrence.endTime);
  const nextDay =
    !!occurrence.startTime &&
    !!occurrence.endTime &&
    endsNextDay(occurrence.startTime, occurrence.endTime);
  // Series — Sermon Title, Gathering-only (both null for Type 1 Events).
  const subtitle =
    event.event_type === "Gathering" ? [event.series, event.sermon_title].filter(Boolean).join(" — ") : "";

  const badge =
    checklist && checklist.total > 0 ? (
      <span
        className={[
          "shrink-0 rounded-pill px-1.5 text-micro font-medium tabular-nums",
          checklistOverdue ? "bg-danger/15 text-danger" : checklist.done === checklist.total ? "bg-ok/15 text-ok" : "bg-black/5 text-ink-2",
        ].join(" ")}
        title={checklistOverdue ? "Checklist: something is overdue" : "Checklist progress"}
      >
        {checklist.done}/{checklist.total}
      </span>
    ) : null;

  return (
    <div
      className={[
        "leading-tight rounded-chip pl-1.5 pr-1 py-0.5",
        LEVEL_CHIP_CLASSES[colorKey],
        lifted ? "shadow-pop scale-[1.03] cursor-grabbing" : "",
      ].join(" ")}
    >
      <div className="text-chip font-medium truncate">
        {event.name}
        {nextDay && <span className="ml-1 text-micro font-normal text-ink-2">(next day)</span>}
        {occurrence.isOverridden && <span className="ml-1 text-micro font-normal text-ink-2">(moved)</span>}
      </div>
      {subtitle && <div className="text-chip text-ink-2 truncate">{subtitle}</div>}
      {(time || badge) && (
        <div className="flex items-center justify-between gap-1 text-chip text-ink-2">
          <span className="truncate">{time}</span>
          {badge}
        </div>
      )}
    </div>
  );
}
