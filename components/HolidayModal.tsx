"use client";

import { useState, FormEvent } from "react";
import { HolidayRow, HolidayType } from "@/lib/types";
import { HOLIDAY_TYPES } from "@/lib/constants";
import { createHoliday, updateHoliday, deleteHoliday } from "@/lib/holidayActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import { INPUT, LABEL } from "./ui/fieldStyles";

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
  const isEditor = useIsEditor();
  const [holidayDate, setHolidayDate] = useState(holiday?.holiday_date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [type, setType] = useState<HolidayType>(holiday?.type ?? HOLIDAY_TYPES[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

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
        const affected = unwrap(await createHoliday(values));
        record(`Add holiday "${values.name}"`, affected);
      } else if (holiday) {
        const affected = unwrap(await updateHoliday(holiday.id, values));
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
      const affected = unwrap(await deleteHoliday(holiday.id));
      record(`Delete holiday "${holiday.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this holiday."
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
    <ModalShell title={mode === "add" ? "Add Holiday" : isEditor ? "Edit Holiday" : "Holiday"} onClose={onClose} footer={footer} widthClass="max-w-md">
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
              <span className={LABEL}>Date</span>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as HolidayType)}
                className={INPUT}
              >
                {HOLIDAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

          </fieldset>
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
    </ModalShell>
  );
}
