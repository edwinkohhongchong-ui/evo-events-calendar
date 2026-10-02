"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dotStyle } from "@/lib/colorStyle";
import { PencilIcon, XIcon } from "./icons";
import { resolveLevelColor } from "@/lib/levelColor";
import { useEventFilter } from "@/lib/eventFilterContext";
import { deleteLevel } from "@/lib/levelActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { LevelRow } from "@/lib/types";
import ConfirmModal from "./ConfirmModal";
import { unwrap } from "@/lib/actionResult";

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
      const affected = unwrap(await deleteLevel(level.id));
      record(`Delete category "${level.name}"`, affected);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Something went wrong deleting this category.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5 items-center">
        {levels.map((level) => {
          const visible = isVisible(level.name);
          const dot = dotStyle(resolveLevelColor(level));
          return (
            <span
              key={level.id}
              className="group inline-flex items-center rounded-pill bg-surface pl-2.5 pr-2.5 h-7 text-chip transition-colors duration-fast ease-apple hover:bg-fill focus-within:bg-fill"
            >
              <button
                type="button"
                onClick={() => toggleLevel(level.name, allNames)}
                title={visible ? `Hide "${level.name}"` : `Show "${level.name}"`}
                aria-pressed={visible}
                className={[
                  "inline-flex items-center gap-1.5 rounded-pill font-medium",
                  visible ? "text-ink" : "text-ink-3 line-through",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  style={visible ? dot.style : undefined}
                  className={[
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    visible ? dot.className : "border-[1.5px] border-ink-3 bg-transparent",
                  ].join(" ")}
                />
                {level.name}
              </button>
              {onEdit && (
                <span
                  className={[
                    "inline-flex items-center overflow-hidden transition-all duration-fast ease-apple",
                    // Narrow/touch: always visible. Desktop: revealed on hover/focus.
                    "max-w-[48px] opacity-100 ml-1",
                    "md:[@media(hover:hover)]:max-w-0 md:[@media(hover:hover)]:opacity-0 md:[@media(hover:hover)]:ml-0",
                    "md:[@media(hover:hover)]:group-hover:max-w-[48px] md:[@media(hover:hover)]:group-hover:opacity-100 md:[@media(hover:hover)]:group-hover:ml-1",
                    "md:[@media(hover:hover)]:group-focus-within:max-w-[48px] md:[@media(hover:hover)]:group-focus-within:opacity-100 md:[@media(hover:hover)]:group-focus-within:ml-1",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onEdit(level)}
                    title="Edit category"
                    aria-label={`Edit category "${level.name}"`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-2 hover:bg-line hover:text-navy"
                  >
                    <PencilIcon className="!h-3.5 !w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(level)}
                    disabled={removingId === level.id}
                    title={`Remove "${level.name}"`}
                    aria-label={`Delete category "${level.name}"`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-2 hover:bg-line hover:text-danger disabled:opacity-30"
                  >
                    <XIcon className="!h-3.5 !w-3.5" />
                  </button>
                </span>
              )}
            </span>
          );
        })}
        {activeLevels && (
          <button
            type="button"
            onClick={showAll}
            className="px-2 text-chip font-medium text-navy hover:underline"
          >
            Show all
          </button>
        )}
      </div>
      {removeError && !pendingDelete && <p className="text-micro text-danger">{removeError}</p>}

      {pendingDelete && (
        <ConfirmModal
              message={<>Delete the &ldquo;{pendingDelete.name}&rdquo; category?</>}
              error={removeError}
              busy={removingId === pendingDelete.id}
              onClose={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemove}
            />
      )}
    </div>
  );
}
