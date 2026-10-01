"use client";

import { useState, FormEvent } from "react";
import { ChecklistTemplateWithItems } from "@/lib/types";
import { saveChecklistTemplate, deleteChecklistTemplate } from "@/lib/checklistTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import Button from "./ui/Button";
import { INPUT, LABEL } from "./ui/fieldStyles";

interface ChecklistTemplateModalProps {
  mode: "add" | "edit";
  template?: ChecklistTemplateWithItems;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

interface DraftItem {
  item: string;
  repeat_count: string;
  weeks_before: string; // blank = no due date
}

const EMPTY_ITEM: DraftItem = { item: "", repeat_count: "1", weeks_before: "" };

export default function ChecklistTemplateModal({
  mode,
  template,
  onClose,
  onSaved,
  onDeleted,
}: ChecklistTemplateModalProps) {
  const { record } = useUndo();
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState<DraftItem[]>(() =>
    template && template.items.length > 0
      ? template.items.map((i) => ({
          item: i.item,
          repeat_count: String(i.repeat_count),
          weeks_before: i.weeks_before == null ? "" : String(i.weeks_before),
        }))
      : [EMPTY_ITEM]
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, EMPTY_ITEM]);
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const cleanItems = items
      .map((it) => ({
        item: it.item.trim(),
        repeat_count: Number(it.repeat_count) || 1,
        weeks_before: it.weeks_before.trim() === "" ? null : Math.max(0, Math.floor(Number(it.weeks_before) || 0)),
      }))
      .filter((it) => it.item.length > 0);
    if (cleanItems.length === 0) {
      setFormError("Add at least one item.");
      return;
    }

    setSaving(true);
    try {
      const affected = unwrap(await saveChecklistTemplate(template?.id ?? null, name.trim(), cleanItems));
      record(`${mode === "add" ? "Add" : "Edit"} checklist template "${name.trim()}"`, affected);
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
      const affected = unwrap(await deleteChecklistTemplate(template.id));
      record(`Delete checklist template "${template.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong deleting this checklist template."
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
    <ModalShell title={mode === "add" ? "Add Checklist Template" : "Edit Checklist Template"} onClose={onClose} footer={footer} widthClass="max-w-lg">
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
                placeholder="Big Event Prep"
                className={INPUT}
                required
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className={LABEL}>Items</span>
              {items.map((it, index) => (
                <div key={index} className="flex items-start gap-2">
                  <input
                    value={it.item}
                    onChange={(e) => updateItem(index, { item: e.target.value })}
                    placeholder="Invite / e-invite (at least 4 weeks before event)"
                    className={`${INPUT} flex-1`}
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    ×
                    <input
                      type="number"
                      min={1}
                      value={it.repeat_count}
                      onChange={(e) => updateItem(index, { repeat_count: e.target.value })}
                      title="Repeat this many times (e.g. 4 for a weekly check-in over 4 weeks) — each gets its own numbered checklist row when applied"
                      className={`${INPUT} !w-16 px-2`}
                    />
                  </label>
                  <label className="flex shrink-0 items-center gap-1 text-micro text-ink-2">
                    Due
                    <input
                      type="number"
                      min={0}
                      value={it.weeks_before}
                      onChange={(e) => updateItem(index, { weeks_before: e.target.value })}
                      placeholder="–"
                      title="Weeks before the event this is due (blank = no due date). For a repeated item, the first row is due this many weeks before and each later row one week later."
                      className={`${INPUT} !w-14 px-2`}
                    />
                    wk
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={items.length === 1}
                    title="Remove this item"
                    className="text-gray-300 hover:text-red-600 disabled:opacity-30 leading-none shrink-0 px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="self-start text-body font-medium text-navy hover:underline"
              >
                + Add another item
              </button>
              <span className="text-micro text-ink-2">
                The × count repeats an item (e.g. a weekly check-in over 4 weeks becomes 4
                separate checklist rows, numbered &ldquo;— Week 1 of 4&rdquo; etc.) when applied
                to an event.
              </span>
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
    </ModalShell>
  );
}
