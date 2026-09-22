"use client";

import { EventBarSegment } from "@/lib/eventBars";
import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { useLevelColor } from "@/lib/levelColorContext";
import { EventOccurrence } from "@/lib/types";

function SegmentButton({
  segment,
  onClick,
}: {
  segment: EventBarSegment;
  onClick: () => void;
}) {
  const colorKey = useLevelColor(segment.occurrence.event.level);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-[11px] leading-[20px] px-1.5 truncate border text-left",
        LEVEL_COLOR_CLASSES[colorKey],
        segment.isSpanStart ? "rounded-l-full" : "border-l-0",
        segment.isSpanEnd ? "rounded-r-full" : "border-r-0",
      ].join(" ")}
      style={{
        gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
        gridRow: segment.laneIndex + 1,
      }}
      title={segment.occurrence.event.name}
    >
      {segment.isSpanStart ? segment.occurrence.event.name : " "}
    </button>
  );
}

// Renders one week's multi-day event bars as a 7-column CSS Grid aligned
// with the day-cell row below it — same technique as SeasonBarRow. Unlike
// season bars, these are clickable (open the same edit modal as a normal
// single-day card) and colored by Level via the shared color context.
export default function EventBarRow({
  segments,
  onEventClick,
}: {
  segments: EventBarSegment[];
  onEventClick: (occurrence: EventOccurrence) => void;
}) {
  if (segments.length === 0) return null;

  return (
    <div className="grid grid-cols-7" style={{ gridAutoRows: "20px" }}>
      {segments.map((segment) => (
        <SegmentButton
          key={`${segment.occurrence.event.id}-${segment.occurrence.originalDate}-w${segment.weekIndex}`}
          segment={segment}
          onClick={() => onEventClick(segment.occurrence)}
        />
      ))}
    </div>
  );
}
