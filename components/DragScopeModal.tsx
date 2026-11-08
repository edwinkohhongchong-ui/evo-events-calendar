"use client";

import { EventOccurrence } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";
import { seriesShiftDescription } from "@/lib/seriesShift";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ModalShell from "./ui/ModalShell";
import RecurringScopeDialog from "./RecurringScopeDialog";

interface DragScopeModalProps {
  occurrence: EventOccurrence;
  targetDate: string;
  delta: number;
  onCancel: () => void;
  onOnlyThis: () => void;
  onAll: () => void;
}

// Shown after a recurring occurrence is dropped on another day. Cancel, Escape,
// the close button and the backdrop all call onCancel: the card snaps back and
// nothing is written.
export default function DragScopeModal({ occurrence, targetDate, delta, onCancel, onOnlyThis, onAll }: DragScopeModalProps) {
  useEscapeKey(onCancel);
  const { event } = occurrence;
  return (
    <ModalShell title="Move repeating event" onClose={onCancel} widthClass="max-w-md">
      <div className="pb-2">
        <RecurringScopeDialog
          title={`“${event.name}” repeats ${event.recurring.toLowerCase()}. Move only ${formatDateDisplay(occurrence.occurrenceDate)} to ${formatDateDisplay(targetDate)}, or every event in the series?`}
          optionALabel="Only this event"
          optionADescription="Moves just this date. The rest of the series stays where it is."
          optionBLabel="All events in the series"
          optionBDescription={`${seriesShiftDescription(event, delta)} You can undo it right after.`}
          busy={false}
          error={null}
          onCancel={onCancel}
          onChooseA={onOnlyThis}
          onChooseB={onAll}
        />
      </div>
    </ModalShell>
  );
}
