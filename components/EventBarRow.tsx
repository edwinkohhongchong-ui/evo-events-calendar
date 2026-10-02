"use client";

import { useDraggable } from "@dnd-kit/core";
import { EventBarSegment } from "@/lib/eventBars";
import { barStyle } from "@/lib/colorStyle";
import { useIsDimmed } from "@/lib/eventSearchContext";
import { useLevelColor } from "@/lib/levelColorContext";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { useEventPreview } from "./EventPreviewCard";
import { useIsEditor } from "@/lib/roleContext";
import { EventOccurrence } from "@/lib/types";

function SegmentBlock({
  segment,
  onClick,
}: {
  segment: EventBarSegment;
  onClick: () => void;
}) {
  const bar = barStyle(useLevelColor(segment.occurrence.event.level));
  const dimmed = useIsDimmed(segment.occurrence.event.id);
  const isEditor = useIsEditor();
  // Same resize-handle mechanism as EventCard's single-day cards — only on
  // the segment containing the event's real last day, so a bar spanning
  // several weeks only offers one resize point per end (right handle at the
  // true last day, left handle at the true first day).
  const {
    listeners: resizeListeners,
    setNodeRef: setResizeRef,
    isDragging: isResizing,
  } = useDraggable({
    id: `resize::${occurrenceKey(segment.occurrence)}`,
    data: { resizeOccurrence: segment.occurrence },
  });

  const {
    listeners: startListeners,
    setNodeRef: setStartRef,
    isDragging: isResizingStart,
  } = useDraggable({
    id: `resizestart::${occurrenceKey(segment.occurrence)}`,
    data: { resizeStartOccurrence: segment.occurrence },
  });

  const { bind, card, hide } = useEventPreview(segment.occurrence, isResizing || isResizingStart);

  return (
    <div
      data-event-id={segment.occurrence.event.id}
      {...bind}
      onPointerDownCapture={hide}
      className={[
        "relative group text-chip font-medium leading-[20px] border",
        bar.className,
        segment.isSpanStart ? "rounded-l-full" : "border-l-0",
        segment.isSpanEnd ? "rounded-r-full" : "border-r-0",
        dimmed ? "opacity-30" : "",
      ].join(" ")}
      style={{
        ...bar.style,
        gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
        gridRow: segment.laneIndex + 1,
      }}
    >
      {card}
      <button
        type="button"
        onClick={onClick}
        aria-label={segment.occurrence.event.name}
        className="absolute inset-0 w-full h-full px-1.5 truncate text-left rounded-[inherit]"
      >
        {/* Repeats the name at the start of every week this bar crosses
            (startCol 0 = Monday), not just at the event's true start —
            otherwise a long event scrolled out of view from its start date
            is just an unlabeled colored bar further down the grid. */}
        {segment.isSpanStart || segment.startCol === 0 ? segment.occurrence.event.name : " "}
      </button>
      {isEditor && segment.isSpanStart && (
        <div
          ref={setStartRef}
          {...startListeners}
          onPointerDown={(e) => {
            e.stopPropagation();
            startListeners?.onPointerDown?.(e);
          }}
          title="Drag to start this event earlier or later"
          className={[
            "absolute top-0 left-0 h-full w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 after:absolute after:inset-y-0 after:left-0 after:w-1.5 after:bg-black/25",
            isResizingStart ? "opacity-100" : "",
          ].join(" ")}
        />
      )}
      {isEditor && segment.isSpanEnd && (
        <div
          ref={setResizeRef}
          {...resizeListeners}
          onPointerDown={(e) => {
            e.stopPropagation();
            resizeListeners?.onPointerDown?.(e);
          }}
          title="Drag to shorten or lengthen this event"
          className={[
            "absolute top-0 right-0 h-full w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 after:absolute after:inset-y-0 after:right-0 after:w-1.5 after:bg-black/25",
            isResizing ? "opacity-100" : "",
          ].join(" ")}
        />
      )}
    </div>
  );
}

// Renders one week's multi-day event bars as a 7-column CSS Grid aligned
// with the day-cell row below it — same technique as SeasonBarRow. Unlike
// season bars, these are clickable (open the same edit modal as a normal
// single-day card), colored by Level via the shared color context, and
// stay resizable via the same drag-to-resize handle single-day cards have.
export default function EventBarRow({
  segments,
  onEventClick,
}: {
  segments: EventBarSegment[];
  onEventClick: (occurrence: EventOccurrence) => void;
}) {
  if (segments.length === 0) return null;

  return (
    <div className="print-event-row grid grid-cols-7" style={{ gridAutoRows: "20px" }}>
      {segments.map((segment) => (
        <SegmentBlock
          key={`${segment.occurrence.event.id}-${segment.occurrence.originalDate}-w${segment.weekIndex}`}
          segment={segment}
          onClick={() => onEventClick(segment.occurrence)}
        />
      ))}
    </div>
  );
}
