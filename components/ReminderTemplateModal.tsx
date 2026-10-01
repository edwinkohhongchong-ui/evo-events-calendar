"use client";

import { useState, FormEvent } from "react";
import { ReminderTemplateRow } from "@/lib/types";
import {
  createReminderTemplate,
  updateReminderTemplate,
  deleteReminderTemplate,
} from "@/lib/reminderTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";

interface ReminderTemplateModalProps {
  mode: "add" | "edit";
  template?: ReminderTemplateRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function ReminderTemplateModal({
  mode,
  template,
  onClose,
  onSaved,
  onDeleted,
}: ReminderTemplateModalProps) {
  const { record } = useUndo();
  const [name, setName] = useState(template?.name ?? "");
  const [defaultMessage, setDefaultMessage] = useState(template?.default_message ?? "");
  const [defaultHandle, setDefaultHandle] = useState(template?.default_telegram_handle ?? "");
  const [lookaheadDays, setLookaheadDays] = useState(String(template?.lookahead_days ?? 30));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const days = Number(lookaheadDays);
    if (!Number.isFinite(days) || days < 1) {
      setFormError("Lookahead days must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        name: name.trim(),
        default_message: defaultMessage.trim() || null,
        default_telegram_handle: defaultHandle.trim() || null,
        include_event_summary: true,
        lookahead_days: days,
      };
      if (mode === "add") {
        const affected = unwrap(await createReminderTemplate(values));
        record(`Add reminder template "${values.name}"`, affected);
      } else if (template) {
        const affected = unwrap(await updateReminderTemplate(template.id, values));
        record(`Edit reminder template "${values.name}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this template.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = unwrap(await deleteReminderTemplate(template.id));
      record(`Delete reminder template "${template.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this template."
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
          {mode === "add" ? "Add Reminder Template" : "Edit Reminder Template"}
        </h2>

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Monthly prep reminder"
                className="border rounded px-2 py-1"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Default Telegram handle
              <input
                value={defaultHandle}
                onChange={(e) => setDefaultHandle(e.target.value)}
                placeholder="@tevo_leaders"
                className="border rounded px-2 py-1"
              />
              <span className="text-xs text-gray-400">
                Must be a public channel/group/bot username — private chats can&apos;t be
                deep-linked to from outside Telegram.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Default message
              <textarea
                value={defaultMessage}
                onChange={(e) => setDefaultMessage(e.target.value)}
                placeholder="Please prepare e-invites and confirm pastoral goals for next month."
                className="border rounded px-2 py-1"
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Default lookahead (days)
              <input
                type="number"
                min={1}
                value={lookaheadDays}
                onChange={(e) => setLookaheadDays(e.target.value)}
                className="border rounded px-2 py-1"
              />
              <span className="text-xs text-gray-400">
                How many days ahead the event picker shows by default when this template is
                selected — you can still widen or narrow it on the Reminders page itself.
              </span>
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
            message={<>Delete &ldquo;{template?.name}&rdquo;? This can&apos;t be undone.</>}
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
