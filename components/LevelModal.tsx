"use client";

import { useState, FormEvent } from "react";
import { LevelRow, SeasonColorKey } from "@/lib/types";
import { LEVEL_COLOR_CLASSES, LEVEL_COLOR_KEYS } from "@/lib/constants";
import { createLevel, updateLevel, deleteLevel } from "@/lib/levelActions";
import { suggestLevelColor } from "@/lib/levelColor";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";

interface LevelModalProps {
  mode: "add" | "edit";
  level?: LevelRow;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function LevelModal({
  mode,
  level,
  nextSortOrder,
  onClose,
  onSaved,
  onDeleted,
}: LevelModalProps) {
  const { record } = useUndo();
  const [name, setName] = useState(level?.name ?? "");
  const [colorKey, setColorKey] = useState<SeasonColorKey>(level?.color_key ?? suggestLevelColor(name));
  // Once the user explicitly picks a swatch, stop following the name-based
  // suggestion — an existing stored color counts as already "touched".
  const [colorTouched, setColorTouched] = useState(!!level?.color_key);
  const [sortOrder, setSortOrder] = useState(String(level?.sort_order ?? nextSortOrder));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

  function handleNameChange(value: string) {
    setName(value);
    if (!colorTouched) {
      setColorKey(suggestLevelColor(value));
    }
  }

  function handleColorPick(key: SeasonColorKey) {
    setColorKey(key);
    setColorTouched(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        name: name.trim(),
        color_key: colorKey,
        sort_order: Number(sortOrder) || 0,
      };
      if (mode === "add") {
        const affected = await createLevel(values);
        record(`Add category "${values.name}"`, affected);
      } else if (level) {
        const affected = await updateLevel(level.id, values);
        record(`Edit category "${values.name}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this category.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!level) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = await deleteLevel(level.id);
      record(`Delete category "${level.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? // The FK's ON DELETE RESTRICT surfaces as a generic Postgres error —
            // reworded here since "violates foreign key constraint" means
            // nothing to a non-technical user.
            err.message.includes("foreign key") || err.message.includes("violates")
            ? "Can't delete this category — it's still used by one or more events. Reassign those events first."
            : err.message
          : "Something went wrong deleting this category."
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-navy mb-3">
          {mode === "add" ? "Add Category" : "Edit Category"}
        </h2>

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <div className="flex flex-col gap-1 text-sm">
              Color
              <div className="flex flex-wrap gap-2">
                {LEVEL_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleColorPick(key)}
                    className={[
                      "w-7 h-7 rounded-full border-2",
                      LEVEL_COLOR_CLASSES[key],
                      colorKey === key ? "ring-2 ring-offset-1 ring-navy" : "",
                    ].join(" ")}
                    aria-label={key}
                    title={key}
                  />
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Order in legend/list
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="border rounded px-2 py-1"
              />
            </label>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between mt-2">
              <div>
                {mode === "edit" && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded bg-navy text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <ConfirmDialog
            message={<>Delete &ldquo;{level?.name}&rdquo;?</>}
            error={formError}
            busy={saving}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
