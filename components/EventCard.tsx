"use client";

import { useDraggable } from "@dnd-kit/core";
import EventCardContent from "./EventCardContent";
import { EventOccurrence } from "@/lib/types";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { useEventPreview } from "./EventPreviewCard";

interface EventCardProps {
  occurrence: EventOccurrence;
  onClick: () => void;
}

export default function EventCard({ occurrence, onClick }: EventCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: occurrenceKey(occurrence),
    data: { occurrence },
  });

  // A second, independent draggable for the resize handle — dropping it on a
  // later day extends this occurrence into a multi-day span (see
  // lib/actions.ts: extendOccurrenceSpan) instead of moving the whole card.
  // stopPropagation on its own pointerdown is what keeps the two draggables
  // from both activating on the same gesture, since the handle sits inside
  // the card's DOM subtree.
  const {
    listeners: resizeListeners,
    setNodeRef: setResizeRef,
    isDragging: isResizing,
  } = useDraggable({
    id: `resize::${occurrenceKey(occurrence)}`,
    data: { resizeOccurrence: occurrence },
  });

  // Mirror handle on the left edge: drag to an earlier day to start the event
  // sooner (end date stays put). See lib/actions.ts: moveOccurrenceStart.
  const {
    listeners: startListeners,
    setNodeRef: setStartRef,
    isDragging: isResizingStart,
  } = useDraggable({
    id: `resizestart::${occurrenceKey(occurrence)}`,
    data: { resizeStartOccurrence: occurrence },
  });

  const { bind, card, hide } = useEventPreview(occurrence, isDragging || isResizing || isResizingStart);

  return (
    <div
      ref={setNodeRef}
      data-event-id={occurrence.event.id}
      {...listeners}
      {...attributes}
      {...bind}
      onPointerDown={(e) => {
        hide();
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        // Enter/Space open the event (drag is pointer-only; no keyboard sensor).
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className={[
        "relative group cursor-grab active:cursor-grabbing rounded-chip hover:brightness-95 transition-[filter] duration-fast",
        isDragging ? "opacity-30" : "",
      ].join(" ")}
    >
      <EventCardContent occurrence={occurrence} />
      {card}
      <div
        ref={setStartRef}
        {...startListeners}
        onPointerDown={(e) => {
          e.stopPropagation();
          startListeners?.onPointerDown?.(e);
        }}
        title="Drag to start this event on an earlier day"
        className={[
          "absolute top-0 left-0 h-full w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 after:absolute after:inset-y-0 after:left-0 after:w-1.5 after:rounded-l-chip after:bg-black/25",
          isResizingStart ? "opacity-100" : "",
        ].join(" ")}
      />
      <div
        ref={setResizeRef}
        {...resizeListeners}
        onPointerDown={(e) => {
          e.stopPropagation();
          resizeListeners?.onPointerDown?.(e);
        }}
        title="Drag to make this a multi-day event"
        className={[
          "absolute top-0 right-0 h-full w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 after:absolute after:inset-y-0 after:right-0 after:w-1.5 after:rounded-r-chip after:bg-black/25",
          isResizing ? "opacity-100" : "",
        ].join(" ")}
      />
    </div>
  );
}
