"use client";

import { useMemo, useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import CalendarHeader from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import EventCardContent from "./EventCardContent";
import EventModal from "./EventModal";
import ErrorBanner from "./ErrorBanner";
import { buildDayIndex } from "@/lib/dayIndex";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { moveOccurrence } from "@/lib/actions";
import { EventOccurrence, EventRow, HolidayRow, SeasonRow } from "@/lib/types";

interface CalendarBoardProps {
  weeks: Date[][];
  monthStart: Date;
  occurrences: EventOccurrence[];
  holidays: HolidayRow[];
  seasons: SeasonRow[];
}

type ModalState =
  | { type: "closed" }
  | { type: "add"; date: string }
  | { type: "edit"; event: EventRow };

export default function CalendarBoard({
  weeks,
  monthStart,
  occurrences,
  holidays,
  seasons,
}: CalendarBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticMove, setOptimisticMove] = useState<{ key: string; newDate: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [activeOcc, setActiveOcc] = useState<EventOccurrence | null>(null);

  // Suppresses the "ghost click" that browsers fire on the drop target right
  // after a real drag ends, which would otherwise pop open the add/edit modal
  // immediately after moving a card.
  const isDraggingRef = useRef(false);

  // Once the post-move router.refresh() lands (isPending flips back to
  // false), the server-provided `occurrences` prop already reflects the
  // move, so the local optimistic patch is no longer needed.
  useEffect(() => {
    if (!isPending) setOptimisticMove(null);
  }, [isPending]);

  const displayOccurrences = useMemo(() => {
    if (!optimisticMove) return occurrences;
    return occurrences.map((occ) =>
      occurrenceKey(occ) === optimisticMove.key
        ? { ...occ, occurrenceDate: optimisticMove.newDate }
        : occ
    );
  }, [occurrences, optimisticMove]);

  const dayIndex = useMemo(
    () => buildDayIndex(weeks.flat(), displayOccurrences, holidays, seasons),
    [weeks, displayOccurrences, holidays, seasons]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(e: DragStartEvent) {
    isDraggingRef.current = true;
    setActiveOcc((e.active.data.current?.occurrence as EventOccurrence) ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveOcc(null);
    // Defer clearing the flag past this gesture's synthetic click event.
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);

    const occurrence = e.active.data.current?.occurrence as EventOccurrence | undefined;
    if (!occurrence || !e.over) return; // invalid drop target: no-op, card stays put
    const targetDate = e.over.id as string;
    if (targetDate === occurrence.occurrenceDate) return; // dropped on its own cell

    setOptimisticMove({ key: occurrenceKey(occurrence), newDate: targetDate });
    try {
      await moveOccurrence(occurrence.event, occurrence.originalDate, targetDate);
      startTransition(() => router.refresh());
    } catch {
      setOptimisticMove(null);
      setError("Couldn't move that event — it's back where it was. Please try again.");
    }
  }

  return (
    <>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <DndContext
        id="calendar-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <CalendarHeader monthStart={monthStart} />
        <CalendarGrid
          weeks={weeks}
          monthStart={monthStart}
          dayIndex={dayIndex}
          onDayClick={(date) => {
            if (isDraggingRef.current) return;
            setModal({ type: "add", date });
          }}
          onEventClick={(occ) => {
            if (isDraggingRef.current) return;
            setModal({ type: "edit", event: occ.event });
          }}
        />
        <DragOverlay>{activeOcc && <EventCardContent occurrence={activeOcc} />}</DragOverlay>
      </DndContext>
      {modal.type !== "closed" && (
        <EventModal
          mode={modal.type}
          initialDate={modal.type === "add" ? modal.date : undefined}
          event={modal.type === "edit" ? modal.event : undefined}
          onClose={() => setModal({ type: "closed" })}
          onSaved={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </>
  );
}
