"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import DayViewEventBlock from "./DayViewEventBlock";
import DayViewEventContent from "./DayViewEventContent";
import EventModal from "./EventModal";
import { useIsEditor } from "@/lib/roleContext";
import ErrorBanner from "./ErrorBanner";
import { retimeOccurrence } from "@/lib/actions";
import { unwrap } from "@/lib/actionResult";
import { occurrenceKey } from "@/lib/occurrenceKey";
import { computeDuration, minutesToTimeStr, timeStrToMinutes } from "@/lib/timeMath";
import { resolveLevelColor } from "@/lib/levelColor";
import { LevelColorProvider } from "@/lib/levelColorContext";
import { useEventFilter } from "@/lib/eventFilterContext";
import { useUndo } from "@/lib/undo/UndoProvider";
import { EventOccurrence, LevelRow } from "@/lib/types";
import LevelChips from "./LevelChips";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SNAP_MINUTES = 15;
const DAY_HEIGHT = 24 * 60; // px — 1px per minute

interface DayViewProps {
  occurrences: EventOccurrence[];
  levels: LevelRow[];
}

type ModalState = { type: "closed" } | { type: "edit"; occurrence: EventOccurrence };

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

export default function DayView({ occurrences, levels }: DayViewProps) {
  const router = useRouter();
  const { isVisible } = useEventFilter();
  const { record } = useUndo();
  const colorMap = useMemo(
    () => Object.fromEntries(levels.map((l) => [l.name, resolveLevelColor(l)])),
    [levels]
  );
  const [isPending, startTransition] = useTransition();
  const [optimisticStart, setOptimisticStart] = useState<{ key: string; startTime: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [activeOcc, setActiveOcc] = useState<EventOccurrence | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isPending) setOptimisticStart(null);
  }, [isPending]);

  const displayOccurrences = useMemo(() => {
    let next = occurrences;
    if (optimisticStart) {
      next = next.map((occ) => {
        if (occurrenceKey(occ) !== optimisticStart.key || !occ.startTime) return occ;
        const durationMinutes = occ.endTime ? computeDuration(occ.startTime, occ.endTime) : null;
        const newStart = optimisticStart.startTime;
        const newEnd =
          durationMinutes != null
            ? minutesToTimeStr(timeStrToMinutes(newStart) + durationMinutes)
            : null;
        return { ...occ, startTime: newStart, endTime: newEnd };
      });
    }
    return next.filter((occ) => isVisible(occ.event.level));
  }, [occurrences, optimisticStart, isVisible]);

  // No sensors for Viewers: nothing can be dragged.
  const isEditor = useIsEditor();
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const sensors = useSensors(...(isEditor ? [pointerSensor] : []));

  function handleDragStart(e: DragStartEvent) {
    isDraggingRef.current = true;
    setActiveOcc((e.active.data.current?.occurrence as EventOccurrence) ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveOcc(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);

    const occurrence = e.active.data.current?.occurrence as EventOccurrence | undefined;
    if (!occurrence || !occurrence.startTime) return;

    const deltaMinutes = Math.round(e.delta.y);
    const snappedDelta = Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    if (snappedDelta === 0) return; // no meaningful move — no-op

    const newStartMinutes = Math.max(
      0,
      Math.min(DAY_HEIGHT - SNAP_MINUTES, timeStrToMinutes(occurrence.startTime) + snappedDelta)
    );
    const newStart = minutesToTimeStr(newStartMinutes);
    if (newStart === occurrence.startTime) return;

    setOptimisticStart({ key: occurrenceKey(occurrence), startTime: newStart });
    try {
      const affected = unwrap(await retimeOccurrence(occurrence.event, occurrence.originalDate, newStart));
      record(`Retime "${occurrence.event.name}"`, affected);
      startTransition(() => router.refresh());
    } catch (err) {
      setOptimisticStart(null);
      setError(err instanceof Error ? err.message : "Couldn't retime that event — it's back where it was. Please try again.");
    }
  }

  return (
    <LevelColorProvider colorMap={colorMap}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="mb-3">
        <LevelChips levels={levels} />
      </div>
      <DndContext id="day-dnd" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex overflow-hidden rounded-card bg-surface">
          <div className="w-14 shrink-0 border-r border-line bg-canvas">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-t border-line pr-2 pt-0.5 text-right text-micro text-ink-2 first:border-t-0"
                style={{ height: 60 }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>
          <div className="relative flex-1">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-line first:border-t-0"
                style={{ top: hour * 60 }}
              />
            ))}
            <div style={{ height: DAY_HEIGHT }} className="relative">
              {displayOccurrences.map((occ) => (
                <DayViewEventBlock
                  key={occurrenceKey(occ)}
                  occurrence={occ}
                  onClick={() => {
                    if (isDraggingRef.current) return;
                    setModal({ type: "edit", occurrence: occ });
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <DragOverlay>
          {activeOcc && (
            <div style={{ width: 220, height: 48 }}>
              <DayViewEventContent occurrence={activeOcc} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {modal.type === "edit" && (
        <EventModal
          mode="edit"
          event={modal.occurrence.event}
          occurrence={modal.occurrence}
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
    </LevelColorProvider>
  );
}
