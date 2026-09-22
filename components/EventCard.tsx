"use client";

import { useDraggable } from "@dnd-kit/core";
import EventCardContent from "./EventCardContent";
import { EventOccurrence } from "@/lib/types";
import { occurrenceKey } from "@/lib/occurrenceKey";

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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={["relative group cursor-grab active:cursor-grabbing", isDragging ? "opacity-30" : ""].join(
        " "
      )}
    >
      <EventCardContent occurrence={occurrence} />
      <div
        ref={setResizeRef}
        {...resizeListeners}
        onPointerDown={(e) => {
          e.stopPropagation();
          resizeListeners?.onPointerDown?.(e);
        }}
        title="Drag to make this a multi-day event"
        className={[
          "absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-black/25 opacity-0 group-hover:opacity-100",
          isResizing ? "opacity-100" : "",
        ].join(" ")}
      />
    </div>
  );
}
