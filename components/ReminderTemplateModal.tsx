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
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import { INPUT, TEXTAREA, LABEL } from "./ui/fieldStyles";

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
    <ModalShell title={mode === "add" ? "Add Reminder Template" : "Edit Reminder Template"} onClose={onClose} footer={footer} widthClass="max-w-md">
        {!confirmDelete ? (
          <form id="modal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError && (
              <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
                {formError}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Monthly prep reminder"
                className={INPUT}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Default Telegram handle</span>
              <input
                value={defaultHandle}
                onChange={(e) => setDefaultHandle(e.target.value)}
                placeholder="@tevo_leaders"
                className={INPUT}
              />
              <span className="text-micro text-ink-2">
                Must be a public channel/group/bot username — private chats can&apos;t be
                deep-linked to from outside Telegram.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Default message</span>
              <textarea
                value={defaultMessage}
                onChange={(e) => setDefaultMessage(e.target.value)}
                placeholder="Please prepare e-invites and confirm pastoral goals for next month."
                className={TEXTAREA}
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Default lookahead (days)</span>
              <input
                type="number"
                min={1}
                value={lookaheadDays}
                onChange={(e) => setLookaheadDays(e.target.value)}
                className={INPUT}
              />
              <span className="text-micro text-ink-2">
                How many days ahead the event picker shows by default when this template is
                selected — you can still widen or narrow it on the Reminders page itself.
              </span>
            </label>

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
    </ModalShell>
  );
}
