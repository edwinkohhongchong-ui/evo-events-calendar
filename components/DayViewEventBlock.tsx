"use client";

import { useDraggable } from "@dnd-kit/core";
import DayViewEventContent from "./DayViewEventContent";
import { EventOccurrence } from "@/lib/types";
import { computeDuration, timeStrToMinutes } from "@/lib/timeMath";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { useIsEditor } from "@/lib/roleContext";

const MIN_HEIGHT = 24; // px — keeps very short/undurationed events visible and clickable
const DAY_HEIGHT = 24 * 60; // px — 1px per minute, matches the grid in DayView

export default function DayViewEventBlock({
  occurrence,
  onClick,
}: {
  occurrence: EventOccurrence;
  onClick: () => void;
}) {
  const isEditor = useIsEditor();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: occurrenceKey(occurrence),
    data: { occurrence },
  });

  if (!occurrence.startTime) return null; // nothing to position on the time axis

  const top = timeStrToMinutes(occurrence.startTime);
  const rawHeight = occurrence.endTime
    ? computeDuration(occurrence.startTime, occurrence.endTime)
    : MIN_HEIGHT;
  const height = Math.max(rawHeight, MIN_HEIGHT);
  // Cap so a wrapped (next-day) event doesn't visually spill past midnight —
  // no day-crossing rendering, consistent with the rest of this app.
  const cappedHeight = Math.min(height, DAY_HEIGHT - top);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ position: "absolute", top, height: cappedHeight, left: 4, right: 4 }}
      className={[isEditor ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", isDragging ? "opacity-30" : ""].join(" ")}
    >
      <DayViewEventContent occurrence={occurrence} />
    </div>
  );
}
