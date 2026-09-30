"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { resolveLevelColor } from "@/lib/levelColor";
import { useEventFilter } from "@/lib/eventFilterContext";
import { deleteLevel } from "@/lib/levelActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { LevelRow } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

interface LevelChipsProps {
  levels: LevelRow[];
  // Optional: when provided, an edit (pencil) button opens the category
  // edit modal. Views without category-management UI (e.g. DayView) omit it.
  onEdit?: (level: LevelRow) => void;
}

// The legend chips double as the category visibility filter: click a chip's
// name to hide/show that category's events (a hidden category's chip is
// dimmed); the small × still deletes the category outright — a distinct,
// more destructive action from toggling visibility — so the two live as
// separate clickable targets within the same chip.
export default function LevelChips({ levels, onEdit }: LevelChipsProps) {
  const { activeLevels, isVisible, toggleLevel, showAll } = useEventFilter();
  const router = useRouter();
  const { record } = useUndo();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LevelRow | null>(null);
  const allNames = levels.map((l) => l.name);

  if (levels.length === 0) return null;

  function handleRemove(level: LevelRow) {
    setRemoveError(null);
    setPendingDelete(level);
  }

  async function handleConfirmRemove() {
    if (!pendingDelete) return;
    const level = pendingDelete;
    setRemovingId(level.id);
    setRemoveError(null);
    try {
      const affected = await deleteLevel(level.id);
      record(`Delete category "${level.name}"`, affected);
      setPendingDelete(null);
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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2 items-center">
        {levels.map((level) => {
          const visible = isVisible(level.name);
          return (
            <span
              key={level.id}
              className={[
                "group flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded border",
                LEVEL_COLOR_CLASSES[resolveLevelColor(level)],
                visible ? "" : "opacity-40",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => toggleLevel(level.name, allNames)}
                title={visible ? `Hide "${level.name}"` : `Show "${level.name}"`}
              >
                {level.name}
              </button>
              {onEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(level)}
                    title="Edit category"
                    className="leading-none opacity-50 hover:opacity-100 px-0.5"
                  >
                    ✎
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
                </>
              )}
            </span>
          );
        })}
        {activeLevels && (
          <button type="button" onClick={showAll} className="text-[11px] text-navy hover:underline">
            Show all
          </button>
        )}
      </div>
      {removeError && !pendingDelete && <p className="text-xs text-red-600">{removeError}</p>}

      {pendingDelete && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              message={<>Delete the &ldquo;{pendingDelete.name}&rdquo; category?</>}
              error={removeError}
              busy={removingId === pendingDelete.id}
              onCancel={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemove}
            />
          </div>
        </div>
      )}
    </div>
  );
}
