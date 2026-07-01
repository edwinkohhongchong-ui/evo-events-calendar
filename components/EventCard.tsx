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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={["cursor-grab active:cursor-grabbing", isDragging ? "opacity-30" : ""].join(" ")}
    >
      <EventCardContent occurrence={occurrence} />
    </div>
  );
}
