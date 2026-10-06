"use client";

import { useState, FormEvent } from "react";
import { ChecklistAutoCheckType, ChecklistRow, ChecklistStatus, EventOption, TargetMonth } from "@/lib/types";
import { CHECKLIST_STATUSES, TARGET_MONTHS } from "@/lib/constants";
import { formatDateDisplay } from "@/lib/dates";
import {
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/lib/checklistActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import { INPUT, TEXTAREA, LABEL } from "./ui/fieldStyles";

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
const NO_AUTO_CHECK = "";

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
  const [autoCheckType, setAutoCheckType] = useState<string>(item?.auto_check_type ?? NO_AUTO_CHECK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape backs out of the inline delete confirm first; only then closes the modal.
  useEscapeKey(() => (confirmDelete ? setConfirmDelete(false) : onClose()));

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
        auto_check_type: (autoCheckType || null) as ChecklistAutoCheckType | null,
      };
      if (mode === "add") {
        const affected = unwrap(await createChecklistItem(values));
        record(`Add checklist item "${values.item}"`, affected);
      } else if (item) {
        const affected = unwrap(await updateChecklistItem(item.id, values));
        record(`Edit checklist item "${values.item}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong saving this checklist item. Check your connection and try again. Your details are still in the form."
      );
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = unwrap(await deleteChecklistItem(item.id));
      record(`Delete checklist item "${item.item}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this checklist item."
      );
      setSaving(false);
    }
  }

  const footer = confirmDelete ? undefined : (
    <>
      <div>
        {mode === "edit" && (
          <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger/10" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="modal-form" loading={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );

  return (
    <ModalShell title={mode === "add" ? "Add Checklist Item" : "Edit Checklist Item"} onClose={onClose} footer={footer} widthClass="max-w-md">
        {!confirmDelete ? (
          <form id="modal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError && (
              <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
                {formError}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Category</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Item</span>
              <input
                value={itemText}
                onChange={(e) => setItemText(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ChecklistStatus)}
                  className={INPUT}
                >
                  {CHECKLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={LABEL}>Target month</span>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className={INPUT}
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
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Linked event</span>
              <select
                value={linkedEventId}
                onChange={(e) => setLinkedEventId(e.target.value)}
                className={INPUT}
              >
                <option value={NO_LINK}>— Not linked —</option>
                {eventOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {formatDateDisplay(opt.event_date)} — {opt.name}
                  </option>
                ))}
              </select>
              <span className="text-micro text-ink-2">
                Used by &ldquo;Check Calendar&rdquo; to confirm this is actually scheduled.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Notes</span>
              <textarea
                value={notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                className={TEXTAREA}
                rows={2}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Automated check</span>
              <select
                value={autoCheckType}
                onChange={(e) => setAutoCheckType(e.target.value)}
                className={INPUT}
              >
                <option value={NO_AUTO_CHECK}>None</option>
                <option value="school_holidays_present">
                  All school holidays present for this month
                </option>
              </select>
              <span className="text-micro text-ink-2">
                Run by &ldquo;Check Calendar&rdquo; — flags this item&rsquo;s notes if the rule
                doesn&rsquo;t pass.
              </span>
            </label>

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
    </ModalShell>
  );
}
