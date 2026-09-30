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
import HolidayModal from "./HolidayModal";
import SeasonModal from "./SeasonModal";
import ErrorBanner from "./ErrorBanner";
import { buildDayIndex } from "@/lib/dayIndex";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { moveOccurrence, extendOccurrenceSpan } from "@/lib/actions";
import { SeasonSegment } from "@/lib/seasonBars";
import { computeEventBarSegments } from "@/lib/eventBars";
import { resolveLevelColor } from "@/lib/levelColor";
import { LevelColorProvider } from "@/lib/levelColorContext";
import { useEventFilter } from "@/lib/eventFilterContext";
import { useUndo } from "@/lib/undo/UndoProvider";
import { DayNoteRow, EventOccurrence, HolidayRow, LevelRow, SeasonRow } from "@/lib/types";

interface CalendarBoardProps {
  weeks: Date[][];
  monthStart: Date;
  occurrences: EventOccurrence[];
  holidays: HolidayRow[];
  dayNotes: DayNoteRow[];
  seasonSegmentsByWeek: SeasonSegment[][];
  levels: LevelRow[];
  defaultAddDate: string;
}

type ModalState =
  | { type: "closed" }
  | { type: "add"; date: string }
  | { type: "edit"; occurrence: EventOccurrence };

type HolidayModalState = { type: "closed" } | { type: "edit"; holiday: HolidayRow };
type SeasonModalState = { type: "closed" } | { type: "edit"; season: SeasonRow };

export default function CalendarBoard({
  weeks,
  monthStart,
  occurrences,
  holidays,
  dayNotes,
  seasonSegmentsByWeek,
  levels,
  defaultAddDate,
}: CalendarBoardProps) {
  const router = useRouter();
  const { isVisible } = useEventFilter();
  const { record } = useUndo();
  const colorMap = useMemo(
    () => Object.fromEntries(levels.map((l) => [l.name, resolveLevelColor(l)])),
    [levels]
  );
  const [isPending, startTransition] = useTransition();
  const [optimisticMove, setOptimisticMove] = useState<{ key: string; newDate: string } | null>(
    null
  );
  const [optimisticResize, setOptimisticResize] = useState<{ key: string; newEndDate: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [holidayModal, setHolidayModal] = useState<HolidayModalState>({ type: "closed" });
  const [seasonModal, setSeasonModal] = useState<SeasonModalState>({ type: "closed" });
  const [activeOcc, setActiveOcc] = useState<EventOccurrence | null>(null);

  // Suppresses the "ghost click" that browsers fire on the drop target right
  // after a real drag ends, which would otherwise pop open the add/edit modal
  // immediately after moving a card.
  const isDraggingRef = useRef(false);

  // Once the post-move router.refresh() lands (isPending flips back to
  // false), the server-provided `occurrences` prop already reflects the
  // move, so the local optimistic patch is no longer needed.
  useEffect(() => {
    if (!isPending) {
      setOptimisticMove(null);
      setOptimisticResize(null);
    }
  }, [isPending]);

  const displayOccurrences = useMemo(() => {
    let next = occurrences;
    if (optimisticMove) {
      next = next.map((occ) =>
        occurrenceKey(occ) === optimisticMove.key
          ? { ...occ, occurrenceDate: optimisticMove.newDate }
          : occ
      );
    }
    if (optimisticResize) {
      next = next.map((occ) =>
        occurrenceKey(occ) === optimisticResize.key
          ? { ...occ, spanEndDate: optimisticResize.newEndDate }
          : occ
      );
    }
    return next.filter((occ) => isVisible(occ.event.level));
  }, [occurrences, optimisticMove, optimisticResize, isVisible]);

  const dayIndex = useMemo(
    () => buildDayIndex(weeks.flat(), displayOccurrences, holidays, monthStart, dayNotes),
    [weeks, displayOccurrences, holidays, monthStart, dayNotes]
  );

  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  const eventSegmentsByWeek = useMemo(
    () => computeEventBarSegments(displayOccurrences, weeks, gridStart, gridEnd),
    [displayOccurrences, weeks, gridStart, gridEnd]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(e: DragStartEvent) {
    isDraggingRef.current = true;
    const data = e.active.data.current;
    setActiveOcc((data?.occurrence as EventOccurrence) ?? (data?.resizeOccurrence as EventOccurrence) ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveOcc(null);
    // Defer clearing the flag past this gesture's synthetic click event.
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);

    if (!e.over) return; // invalid drop target: no-op, card/handle stays put
    const targetDate = e.over.id as string;

    const resizeOccurrence = e.active.data.current?.resizeOccurrence as EventOccurrence | undefined;
    if (resizeOccurrence) {
      if (targetDate === resizeOccurrence.spanEndDate) return; // dropped on its current end
      if (targetDate < resizeOccurrence.occurrenceDate) return; // can't resize to before the start
      setOptimisticResize({ key: occurrenceKey(resizeOccurrence), newEndDate: targetDate });
      try {
        const affected = await extendOccurrenceSpan(
          resizeOccurrence.event,
          resizeOccurrence.originalDate,
          targetDate
        );
        record(`Resize "${resizeOccurrence.event.name}"`, affected);
        startTransition(() => router.refresh());
        // Open straight into editing so time/other details can be filled in
        // right after resizing — the resized occurrence's own spanEndDate
        // isn't reflected in the (not-yet-refreshed) occurrence object, so
        // it's patched in here rather than waiting on the refresh to land.
        setModal({ type: "edit", occurrence: { ...resizeOccurrence, spanEndDate: targetDate } });
      } catch {
        setOptimisticResize(null);
        setError("Couldn't resize that event — it's back where it was. Please try again.");
      }
      return;
    }

    const occurrence = e.active.data.current?.occurrence as EventOccurrence | undefined;
    if (!occurrence) return;
    if (targetDate === occurrence.occurrenceDate) return; // dropped on its own cell

    setOptimisticMove({ key: occurrenceKey(occurrence), newDate: targetDate });
    try {
      const affected = await moveOccurrence(occurrence.event, occurrence.originalDate, targetDate);
      record(`Move "${occurrence.event.name}"`, affected);
      startTransition(() => router.refresh());
    } catch {
      setOptimisticMove(null);
      setError("Couldn't move that event — it's back where it was. Please try again.");
    }
  }

  return (
    <LevelColorProvider colorMap={colorMap}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <DndContext
        id="calendar-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <CalendarHeader
          monthStart={monthStart}
          levels={levels}
          onAddClick={() => setModal({ type: "add", date: defaultAddDate })}
        />
        <CalendarGrid
          weeks={weeks}
          monthStart={monthStart}
          dayIndex={dayIndex}
          seasonSegmentsByWeek={seasonSegmentsByWeek}
          eventSegmentsByWeek={eventSegmentsByWeek}
          onDayClick={(date) => {
            if (isDraggingRef.current) return;
            setModal({ type: "add", date });
          }}
          onEventClick={(occ) => {
            if (isDraggingRef.current) return;
            setModal({ type: "edit", occurrence: occ });
          }}
          onHolidayClick={(holiday) => setHolidayModal({ type: "edit", holiday })}
          onSeasonClick={(season) => setSeasonModal({ type: "edit", season })}
        />
        <DragOverlay>{activeOcc && <EventCardContent occurrence={activeOcc} />}</DragOverlay>
      </DndContext>
      {modal.type !== "closed" && (
        <EventModal
          mode={modal.type}
          initialDate={modal.type === "add" ? modal.date : undefined}
          event={modal.type === "edit" ? modal.occurrence.event : undefined}
          occurrence={modal.type === "edit" ? modal.occurrence : undefined}
          levels={levels}
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
      {holidayModal.type !== "closed" && (
        <HolidayModal
          mode="edit"
          holiday={holidayModal.holiday}
          onClose={() => setHolidayModal({ type: "closed" })}
          onSaved={() => {
            setHolidayModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setHolidayModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
      {seasonModal.type !== "closed" && (
        <SeasonModal
          mode="edit"
          season={seasonModal.season}
          onClose={() => setSeasonModal({ type: "closed" })}
          onSaved={() => {
            setSeasonModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setSeasonModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </LevelColorProvider>
  );
}
