"use client";

import { useState, FormEvent } from "react";
import { EventRow, Level, Recurring } from "@/lib/types";
import { LEVELS } from "@/lib/constants";
import { createEvent, updateEvent, deleteEvent, EventFormValues } from "@/lib/actions";
import ConfirmDialog from "./ConfirmDialog";

interface EventModalProps {
  mode: "add" | "edit";
  initialDate?: string;
  event?: EventRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const RECURRING_OPTIONS: Recurring[] = ["None", "Weekly", "Monthly", "Yearly"];

export default function EventModal({
  mode,
  initialDate,
  event,
  onClose,
  onSaved,
  onDeleted,
}: EventModalProps) {
  const [name, setName] = useState(event?.name ?? "");
  const [eventDate, setEventDate] = useState(event?.event_date ?? initialDate ?? "");
  const [eventTime, setEventTime] = useState(event?.event_time?.slice(0, 5) ?? "");
  const [level, setLevel] = useState<Level>(event?.level ?? "Churchwide");
  const [recurring, setRecurring] = useState<Recurring>(event?.recurring ?? "None");
  const [repeatUntil, setRepeatUntil] = useState(event?.repeat_until ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRecurringSeries = mode === "edit" && !!event && event.recurring !== "None";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!eventDate) {
      setFormError("Date is required.");
      return;
    }

    setSaving(true);
    const values: EventFormValues = {
      name: name.trim(),
      event_date: eventDate,
      event_time: eventTime || null,
      level,
      recurring,
      repeat_until: recurring === "None" ? null : repeatUntil || null,
      notes: notes.trim() || null,
    };

    try {
      if (mode === "add") {
        await createEvent(values);
      } else if (event) {
        await updateEvent(event.id, values);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this event.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteEvent(event.id);
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong deleting this event.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-navy mb-1">
          {mode === "add" ? "Add Event" : "Edit Event"}
        </h2>
        {isRecurringSeries && (
          <p className="text-xs text-gray-500 mb-3">
            Editing the recurring pattern — changes apply to the whole series, not just one
            occurrence.
          </p>
        )}

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Date
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="border rounded px-2 py-1"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Time
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Level
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="border rounded px-2 py-1"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Recurring
                <select
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value as Recurring)}
                  className="border rounded px-2 py-1"
                >
                  {RECURRING_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Repeat until
                <input
                  type="date"
                  value={repeatUntil ?? ""}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  disabled={recurring === "None"}
                  className="border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded px-2 py-1"
                rows={2}
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
            message={
              isRecurringSeries ? (
                <>
                  <strong className="text-red-600">
                    This will delete all occurrences of this recurring event
                  </strong>{" "}
                  — the entire &ldquo;{event?.name}&rdquo; series ({event?.recurring}), not just
                  one date. This can&apos;t be undone.
                </>
              ) : (
                <>Delete &ldquo;{event?.name}&rdquo;? This can&apos;t be undone.</>
              )
            }
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
