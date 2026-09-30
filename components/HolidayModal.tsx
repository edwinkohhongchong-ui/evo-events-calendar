"use client";

import { useState, FormEvent } from "react";
import { HolidayRow, HolidayType } from "@/lib/types";
import { HOLIDAY_TYPES } from "@/lib/constants";
import { createHoliday, updateHoliday, deleteHoliday } from "@/lib/holidayActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import ConfirmDialog from "./ConfirmDialog";

interface HolidayModalProps {
  mode: "add" | "edit";
  holiday?: HolidayRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function HolidayModal({
  mode,
  holiday,
  onClose,
  onSaved,
  onDeleted,
}: HolidayModalProps) {
  const { record } = useUndo();
  const [holidayDate, setHolidayDate] = useState(holiday?.holiday_date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [type, setType] = useState<HolidayType>(holiday?.type ?? HOLIDAY_TYPES[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!holidayDate) {
      setFormError("Date is required.");
      return;
    }
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const values = { holiday_date: holidayDate, name: name.trim(), type };
      if (mode === "add") {
        const affected = await createHoliday(values);
        record(`Add holiday "${values.name}"`, affected);
      } else if (holiday) {
        const affected = await updateHoliday(holiday.id, values);
        record(`Edit holiday "${values.name}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this holiday.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!holiday) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = await deleteHoliday(holiday.id);
      record(`Delete holiday "${holiday.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this holiday."
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
          {mode === "add" ? "Add Holiday" : "Edit Holiday"}
        </h2>

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as HolidayType)}
                className="border rounded px-2 py-1"
              >
                {HOLIDAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
            message={<>Delete &ldquo;{holiday?.name}&rdquo;?</>}
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
