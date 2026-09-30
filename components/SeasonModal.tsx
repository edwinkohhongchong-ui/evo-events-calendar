"use client";

import { useState, FormEvent } from "react";
import { SeasonRow, SeasonCategory, SeasonColorKey } from "@/lib/types";
import { SEASON_BAR_COLORS, SEASON_CATEGORIES, SEASON_COLOR_KEYS } from "@/lib/constants";
import { createSeason, updateSeason, deleteSeason } from "@/lib/seasonActions";
import { suggestSeasonColor } from "@/lib/seasonColor";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";

interface SeasonModalProps {
  mode: "add" | "edit";
  season?: SeasonRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function SeasonModal({ mode, season, onClose, onSaved, onDeleted }: SeasonModalProps) {
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [name, setName] = useState(season?.name ?? "");
  const [category, setCategory] = useState<SeasonCategory>(season?.category ?? SEASON_CATEGORIES[0]);
  const [startDate, setStartDate] = useState(season?.start_date ?? "");
  const [endDate, setEndDate] = useState(season?.end_date ?? "");
  const [notes, setNotes] = useState(season?.notes ?? "");
  const [color, setColor] = useState<SeasonColorKey>(season?.color ?? suggestSeasonColor(name));
  // Once the user explicitly picks a swatch, stop following the name-based
  // suggestion — an existing stored color counts as already "touched".
  const [colorTouched, setColorTouched] = useState(!!season?.color);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

  function handleNameChange(value: string) {
    setName(value);
    if (!colorTouched) {
      setColor(suggestSeasonColor(value));
    }
  }

  function handleColorPick(key: SeasonColorKey) {
    setColor(key);
    setColorTouched(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!startDate || !endDate) {
      setFormError("Start and end dates are required.");
      return;
    }
    if (endDate < startDate) {
      setFormError("End date can't be before start date.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        name: name.trim(),
        category,
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
        color,
      };
      if (mode === "add") {
        const affected = await createSeason(values);
        record(`Add season "${values.name}"`, affected);
      } else if (season) {
        const affected = await updateSeason(season.id, values);
        record(`Edit season "${values.name}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this season.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!season) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = await deleteSeason(season.id);
      record(`Delete season "${season.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this season."
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
          {mode === "add" ? "Add Season" : "Edit Season"}
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
                {SEASON_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleColorPick(key)}
                    className={[
                      "w-7 h-7 rounded-full border-2",
                      SEASON_BAR_COLORS[key],
                      color === key ? "ring-2 ring-offset-1 ring-navy" : "",
                    ].join(" ")}
                    aria-label={key}
                    title={key}
                  />
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SeasonCategory)}
                className="border rounded px-2 py-1"
              >
                {SEASON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border rounded px-2 py-1"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border rounded px-2 py-1"
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Notes
              <textarea
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded px-2 py-1"
                rows={2}
              />
            </label>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-between mt-2">
              <div>
                {mode === "edit" && isEditor && (
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
            message={<>Delete &ldquo;{season?.name}&rdquo;?</>}
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
