"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, addMonths, subMonths } from "date-fns";
import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { resolveLevelColor } from "@/lib/levelColor";
import { deleteLevel } from "@/lib/levelActions";
import { LevelRow } from "@/lib/types";
import LevelModal from "./LevelModal";

interface CalendarHeaderProps {
  monthStart: Date;
  levels: LevelRow[];
  onAddClick: () => void;
}

type LevelModalState = { type: "closed" } | { type: "add" } | { type: "edit"; level: LevelRow };

export default function CalendarHeader({ monthStart, levels, onAddClick }: CalendarHeaderProps) {
  const router = useRouter();
  const prev = subMonths(monthStart, 1);
  const next = addMonths(monthStart, 1);
  const [levelModal, setLevelModal] = useState<LevelModalState>({ type: "closed" });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const nextSortOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0;

  async function handleRemove(level: LevelRow) {
    if (!window.confirm(`Delete the "${level.name}" category?`)) return;
    setRemovingId(level.id);
    setRemoveError(null);
    try {
      await deleteLevel(level.id);
      router.refresh();
    } catch (err) {
      setRemoveError(
        err instanceof Error && (err.message.includes("foreign key") || err.message.includes("violates"))
          ? `Can't delete "${level.name}" — it's still used by one or more events.`
          : err instanceof Error
            ? err.message
            : "Something went wrong deleting this category."
      );
    } finally {
      setRemovingId(null);
    }
  }

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
          <button
            type="button"
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
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {levels.map((level) => (
          <span
            key={level.id}
            className={[
              "group flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded border",
              LEVEL_COLOR_CLASSES[resolveLevelColor(level)],
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => setLevelModal({ type: "edit", level })}
              title="Edit category"
            >
              {level.name}
            </button>
            <button
              type="button"
              onClick={() => handleRemove(level)}
              disabled={removingId === level.id}
              title={`Remove "${level.name}"`}
              className="leading-none opacity-50 hover:opacity-100 disabled:opacity-30 px-0.5"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {removeError && <p className="text-xs text-red-600">{removeError}</p>}

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
