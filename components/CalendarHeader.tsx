"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, addMonths, subMonths } from "date-fns";
import { LevelRow } from "@/lib/types";
import { useIsEditor } from "@/lib/roleContext";
import LevelModal from "./LevelModal";
import LevelChips from "./LevelChips";

interface CalendarHeaderProps {
  monthStart: Date;
  levels: LevelRow[];
  onAddClick?: () => void;
}

type LevelModalState = { type: "closed" } | { type: "add" } | { type: "edit"; level: LevelRow };

export default function CalendarHeader({ monthStart, levels, onAddClick }: CalendarHeaderProps) {
  const router = useRouter();
  const isEditor = useIsEditor();
  const prev = subMonths(monthStart, 1);
  const next = addMonths(monthStart, 1);
  const [levelModal, setLevelModal] = useState<LevelModalState>({ type: "closed" });
  const nextSortOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0;

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-navy">{format(monthStart, "MMMM yyyy")}</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/?year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            ← Prev
          </Link>
          <Link
            href="/"
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            Today
          </Link>
          <Link
            href={`/?year=${next.getFullYear()}&month=${next.getMonth() + 1}`}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-navy"
          >
            Next →
          </Link>
          {isEditor && (
            <>
              <button
                type="button"
                data-tour="add-event-button"
                onClick={onAddClick}
                className="px-2.5 py-1 rounded bg-navy text-white"
              >
                + Add Event
              </button>
              <button
                type="button"
                onClick={() => setLevelModal({ type: "add" })}
                className="px-2.5 py-1 rounded border border-navy text-navy hover:bg-gray-50"
              >
                + Add Category
              </button>
            </>
          )}
        </div>
      </div>

      <LevelChips
        levels={levels}
        onEdit={isEditor ? (level) => setLevelModal({ type: "edit", level }) : undefined}
      />

      {levelModal.type !== "closed" && (
        <LevelModal
          mode={levelModal.type}
          level={levelModal.type === "edit" ? levelModal.level : undefined}
          nextSortOrder={nextSortOrder}
          onClose={() => setLevelModal({ type: "closed" })}
          onSaved={() => {
            setLevelModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setLevelModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
