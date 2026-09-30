"use client";

import { useState, FormEvent } from "react";
import { ChecklistRow, ChecklistStatus, EventOption, TargetMonth } from "@/lib/types";
import { CHECKLIST_STATUSES, TARGET_MONTHS } from "@/lib/constants";
import { formatDateDisplay } from "@/lib/dates";
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/lib/checklistActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import ConfirmDialog from "./ConfirmDialog";

interface ChecklistModalProps {
  mode: "add" | "edit";
  item?: ChecklistRow;
  eventOptions: EventOption[];
  // Pre-selects "Linked event" when adding — used by the Reminders page's
  // "+ Add checklist item" shortcut on a flagged event with no prep tracked
  // yet, so the link doesn't have to be found again in the dropdown.
  defaultLinkedEventId?: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const NO_MONTH = "";
const NO_LINK = "";

export default function ChecklistModal({
  mode,
  item,
  eventOptions,
  defaultLinkedEventId,
  onClose,
  onSaved,
  onDeleted,
}: ChecklistModalProps) {
  const { record } = useUndo();
  const [category, setCategory] = useState(item?.category ?? "");
  const [itemText, setItemText] = useState(item?.item ?? "");
  const [status, setStatus] = useState<ChecklistStatus>(item?.status ?? "Not Started");
  const [targetMonth, setTargetMonth] = useState<string>(item?.target_month ?? NO_MONTH);
  const [linkedEventId, setLinkedEventId] = useState<string>(
    item?.linked_event_id ?? defaultLinkedEventId ?? NO_LINK
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!category.trim()) {
      setFormError("Category is required.");
      return;
    }
    if (!itemText.trim()) {
      setFormError("Item is required.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        category: category.trim(),
        item: itemText.trim(),
        status,
        target_month: (targetMonth || null) as TargetMonth | null,
        notes: notes.trim() || null,
        linked_event_id: linkedEventId || null,
      };
      if (mode === "add") {
        const affected = await createChecklistItem(values);
        record(`Add checklist item "${values.item}"`, affected);
      } else if (item) {
        const affected = await updateChecklistItem(item.id, values);
        record(`Edit checklist item "${values.item}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong saving this checklist item."
      );
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = await deleteChecklistItem(item.id);
      record(`Delete checklist item "${item.item}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this checklist item."
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
          {mode === "add" ? "Add Checklist Item" : "Edit Checklist Item"}
        </h2>

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Category
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Item
              <input
                value={itemText}
                onChange={(e) => setItemText(e.target.value)}
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ChecklistStatus)}
                  className="border rounded px-2 py-1"
                >
                  {CHECKLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Target month
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value={NO_MONTH}>—</option>
                  {TARGET_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Linked event
              <select
                value={linkedEventId}
                onChange={(e) => setLinkedEventId(e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value={NO_LINK}>— Not linked —</option>
                {eventOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {formatDateDisplay(opt.event_date)} — {opt.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400 font-normal">
                Used by &ldquo;Check Calendar&rdquo; to confirm this is actually scheduled.
              </span>
            </label>
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
            message={<>Delete &ldquo;{item?.item}&rdquo;?</>}
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
