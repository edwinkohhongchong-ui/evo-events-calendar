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
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import { INPUT, TEXTAREA, LABEL } from "./ui/fieldStyles";

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
        const affected = unwrap(await createSeason(values));
        record(`Add season "${values.name}"`, affected);
      } else if (season) {
        const affected = unwrap(await updateSeason(season.id, values));
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
      const affected = unwrap(await deleteSeason(season.id));
      record(`Delete season "${season.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this season."
      );
      setSaving(false);
    }
  }

  const footer = confirmDelete ? undefined : (
    <>
      <div>
        {mode === "edit" && isEditor && (
          <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger/10" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          {isEditor ? "Cancel" : "Close"}
        </Button>
        {isEditor && (
          <Button type="submit" form="modal-form" loading={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </>
  );

  return (
    <ModalShell title={mode === "add" ? "Add Season" : isEditor ? "Edit Season" : "Season"} onClose={onClose} footer={footer} widthClass="max-w-md">
        {!confirmDelete ? (
          <form id="modal-form" onSubmit={handleSubmit}>
          {/* Viewers see the details read-only; the fieldset disables every control inside. */}
          <fieldset disabled={!isEditor} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            {formError && (
              <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
                {formError}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Name</span>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Color</span>
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
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SeasonCategory)}
                className={INPUT}
              >
                {SEASON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={INPUT}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>End date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={INPUT}
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Notes</span>
              <textarea
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                className={TEXTAREA}
                rows={2}
              />
            </label>

          </fieldset>
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
    </ModalShell>
  );
}
