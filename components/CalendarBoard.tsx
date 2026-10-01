"use client";

import { useMemo, useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startOfMonth, endOfMonth } from "date-fns";
import { toDateStr } from "@/lib/dates";
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
import MonthAgenda from "./MonthAgenda";
import EventCardContent from "./EventCardContent";
import EventModal from "./EventModal";
import HolidayModal from "./HolidayModal";
import SeasonModal from "./SeasonModal";
import ErrorBanner from "./ErrorBanner";
import { buildDayIndex } from "@/lib/dayIndex";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { withOptimisticMove } from "@/lib/optimisticMove";
import { moveOccurrence, extendOccurrenceSpan, moveOccurrenceStart } from "@/lib/actions";
import { unwrap } from "@/lib/actionResult";
import { SeasonSegment } from "@/lib/seasonBars";
import { computeEventBarSegments } from "@/lib/eventBars";
import { resolveLevelColor } from "@/lib/levelColor";
import { LevelColorProvider } from "@/lib/levelColorContext";
import { EventChecklistProvider } from "@/lib/eventChecklistContext";
import { useEventFilter } from "@/lib/eventFilterContext";
import { EventSearchContext, type EventSearchValue } from "@/lib/eventSearchContext";
import { matchesEventQuery, parseSearchQuery } from "@/lib/eventSearch";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import FocusHighlighter from "./FocusHighlighter";
import { DayNoteRow, EventChecklistProgress, EventOccurrence, EventRow, HolidayRow, LevelRow, OpenChecklistRow, SeasonRow } from "@/lib/types";

interface CalendarBoardProps {
  weeks: Date[][];
  monthStart: Date;
  occurrences: EventOccurrence[];
  holidays: HolidayRow[];
  dayNotes: DayNoteRow[];
  seasonSegmentsByWeek: SeasonSegment[][];
  levels: LevelRow[];
  defaultAddDate: string;
  checklistProgress: Record<string, EventChecklistProgress>;
  openChecklistRows: OpenChecklistRow[];
}

type ModalState =
  | { type: "closed" }
  | { type: "add"; date: string }
  | { type: "edit"; occurrence: EventOccurrence }
  | { type: "editEvent"; event: EventRow }; // opened from the overdue pill: the event may be in another month

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
  checklistProgress,
  openChecklistRows,
}: CalendarBoardProps) {
  const router = useRouter();
  const { isVisible } = useEventFilter();
  const { record } = useUndo();
  const isEditor = useIsEditor();
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
  const [optimisticStart, setOptimisticStart] = useState<{ key: string; newStartDate: string } | null>(
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
      setOptimisticStart(null);
    }
  }, [isPending]);

  const displayOccurrences = useMemo(() => {
    let next = occurrences;
    if (optimisticMove) {
      next = next.map((occ) =>
        occurrenceKey(occ) === optimisticMove.key
          ? withOptimisticMove(occ, optimisticMove.newDate)
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
    if (optimisticStart) {
      next = next.map((occ) =>
        occurrenceKey(occ) === optimisticStart.key
          ? { ...occ, occurrenceDate: optimisticStart.newStartDate }
          : occ
      );
    }
    return next.filter((occ) => isVisible(occ.event.level));
  }, [occurrences, optimisticMove, optimisticResize, optimisticStart, isVisible]);

  // Search dims non-matching chips (CalendarGrid/EventBarRow/EventCardContent
  // read this context) rather than removing them, so dates keep their context.
  const [searchQuery, setSearchQuery] = useState("");
  const search = useMemo<EventSearchValue>(() => {
    const active = parseSearchQuery(searchQuery).length > 0;
    const matchedIds = new Set<string>();
    let matchCount = 0;
    if (active) {
      const monthFirst = toDateStr(startOfMonth(monthStart));
      const monthLast = toDateStr(endOfMonth(monthStart));
      for (const occ of displayOccurrences) {
        if (!matchesEventQuery(occ.event, searchQuery)) continue;
        matchedIds.add(occ.event.id);
        if (occ.spanEndDate >= monthFirst && occ.occurrenceDate <= monthLast) matchCount++;
      }
    }
    return { query: searchQuery, setQuery: setSearchQuery, active, matchedIds, matchCount };
  }, [searchQuery, displayOccurrences, monthStart]);

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
    setActiveOcc((data?.occurrence as EventOccurrence) ??
        (data?.resizeOccurrence as EventOccurrence) ??
        (data?.resizeStartOccurrence as EventOccurrence) ??
        null
    );
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveOcc(null);
    // Defer clearing the flag past this gesture's synthetic click event.
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);

    if (!e.over) return; // invalid drop target: no-op, card/handle stays put
    const targetDate = e.over.id as string;

    const resizeStartOccurrence = e.active.data.current?.resizeStartOccurrence as
      | EventOccurrence
      | undefined;
    if (resizeStartOccurrence) {
      if (targetDate === resizeStartOccurrence.occurrenceDate) return; // dropped on its current start
      if (targetDate > resizeStartOccurrence.spanEndDate) return; // can't start after the end
      setOptimisticStart({ key: occurrenceKey(resizeStartOccurrence), newStartDate: targetDate });
      try {
        const affected = unwrap(await moveOccurrenceStart(
          resizeStartOccurrence.event,
          resizeStartOccurrence.originalDate,
          targetDate,
          resizeStartOccurrence.spanEndDate
        ));
        record(`Resize "${resizeStartOccurrence.event.name}"`, affected);
        startTransition(() => router.refresh());
      } catch (err) {
        setOptimisticStart(null);
        setError(err instanceof Error ? err.message : "Couldn't resize that event — it's back where it was. Please try again.");
      }
      return;
    }

    const resizeOccurrence = e.active.data.current?.resizeOccurrence as EventOccurrence | undefined;
    if (resizeOccurrence) {
      if (targetDate === resizeOccurrence.spanEndDate) return; // dropped on its current end
      if (targetDate < resizeOccurrence.occurrenceDate) return; // can't resize to before the start
      setOptimisticResize({ key: occurrenceKey(resizeOccurrence), newEndDate: targetDate });
      try {
        const affected = unwrap(await extendOccurrenceSpan(
          resizeOccurrence.event,
          resizeOccurrence.originalDate,
          targetDate
        ));
        record(`Resize "${resizeOccurrence.event.name}"`, affected);
        startTransition(() => router.refresh());
        // Open straight into editing so time/other details can be filled in
        // right after resizing — the resized occurrence's own spanEndDate
        // isn't reflected in the (not-yet-refreshed) occurrence object, so
        // it's patched in here rather than waiting on the refresh to land.
        setModal({ type: "edit", occurrence: { ...resizeOccurrence, spanEndDate: targetDate } });
      } catch (err) {
        setOptimisticResize(null);
        setError(err instanceof Error ? err.message : "Couldn't resize that event — it's back where it was. Please try again.");
      }
      return;
    }

    const occurrence = e.active.data.current?.occurrence as EventOccurrence | undefined;
    if (!occurrence) return;
    if (targetDate === occurrence.occurrenceDate) return; // dropped on its own cell

    setOptimisticMove({ key: occurrenceKey(occurrence), newDate: targetDate });
    try {
      const affected = unwrap(await moveOccurrence(occurrence.event, occurrence.originalDate, targetDate));
      record(`Move "${occurrence.event.name}"`, affected);
      startTransition(() => router.refresh());
    } catch (err) {
      setOptimisticMove(null);
      setError(err instanceof Error ? err.message : "Couldn't move that event — it's back where it was. Please try again.");
    }
  }

  return (
    <LevelColorProvider colorMap={colorMap}>
      <EventSearchContext.Provider value={search}>
      <EventChecklistProvider progress={checklistProgress}>
      <FocusHighlighter />
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
          onAddClick={isEditor ? () => setModal({ type: "add", date: defaultAddDate }) : undefined}
          openChecklistRows={openChecklistRows}
          onOpenEvent={(event) => setModal({ type: "editEvent", event })}
        />
        <div data-tour="calendar-grid">
          <div className="sm:hidden">
            <MonthAgenda
              monthStart={monthStart}
              days={weeks.flat()}
              dayIndex={dayIndex}
              occurrences={displayOccurrences}
              seasonSegmentsByWeek={seasonSegmentsByWeek}
              onEventClick={(occ) => setModal({ type: "edit", occurrence: occ })}
              onHolidayClick={(holiday) => setHolidayModal({ type: "edit", holiday })}
              onSeasonClick={(season) => setSeasonModal({ type: "edit", season })}
            />
          </div>
          <div className="hidden sm:block">
          <CalendarGrid
            weeks={weeks}
            monthStart={monthStart}
            dayIndex={dayIndex}
            seasonSegmentsByWeek={seasonSegmentsByWeek}
            eventSegmentsByWeek={eventSegmentsByWeek}
            onDayClick={(date) => {
              if (isDraggingRef.current || !isEditor) return;
              setModal({ type: "add", date });
            }}
            onEventClick={(occ) => {
              if (isDraggingRef.current) return;
              setModal({ type: "edit", occurrence: occ });
            }}
            onHolidayClick={(holiday) => setHolidayModal({ type: "edit", holiday })}
            onSeasonClick={(season) => setSeasonModal({ type: "edit", season })}
          />
          </div>
        </div>
        <DragOverlay>{activeOcc && <EventCardContent occurrence={activeOcc} lifted />}</DragOverlay>
      </DndContext>
      {modal.type !== "closed" && (
        <EventModal
          mode={modal.type === "add" ? "add" : "edit"}
          initialDate={modal.type === "add" ? modal.date : undefined}
          event={modal.type === "edit" ? modal.occurrence.event : modal.type === "editEvent" ? modal.event : undefined}
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
      </EventChecklistProvider>
      </EventSearchContext.Provider>
    </LevelColorProvider>
  );
}
