"use client";

import { useState, FormEvent } from "react";
import { ChecklistTemplateWithItems } from "@/lib/types";
import { saveChecklistTemplate, deleteChecklistTemplate } from "@/lib/checklistTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import IconButton from "./ui/IconButton";
import { XIcon } from "./icons";
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
  weeks_before: string; // blank = no due date (a positive number of weeks)
  after: boolean; // true = due AFTER the event (saved as a negative offset)
}

const EMPTY_ITEM: DraftItem = { item: "", repeat_count: "1", weeks_before: "", after: false };

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
          weeks_before: i.weeks_before == null ? "" : String(Math.abs(i.weeks_before)),
          after: i.weeks_before != null && i.weeks_before < 0,
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
        weeks_before:
          it.weeks_before.trim() === ""
            ? null
            : (it.after ? -1 : 1) * Math.max(0, Math.floor(Number(it.weeks_before) || 0)),
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
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this template. Check your connection and try again. Your details are still in the form.");
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

            <div className="flex flex-col gap-3">
              <span className={LABEL}>Items</span>
              {items.map((it, index) => {
                const count = Math.max(1, Number(it.repeat_count) || 1);
                const first = it.weeks_before.trim() === "" ? null : Math.max(0, Math.floor(Number(it.weeks_before) || 0));
                const steps =
                  first !== null && count > 1
                    ? Array.from({ length: count }, (_, i) => (it.after ? first + i : Math.max(0, first - i)))
                    : null;
                return (
                  <div key={index} className="flex flex-col gap-2 rounded-ctl border border-line p-3">
                    <div className="flex items-start gap-2">
                      <input
                        value={it.item}
                        onChange={(e) => updateItem(index, { item: e.target.value })}
                        placeholder="e.g. Send the e-invite"
                        aria-label={`Item ${index + 1}`}
                        className={`${INPUT} flex-1`}
                      />
                      <IconButton
                        label="Remove this item"
                        icon={<XIcon className="!h-4 !w-4" />}
                        onClick={() => removeRow(index)}
                        disabled={items.length === 1}
                        className="mt-0.5 hover:!text-danger [@media(pointer:coarse)]:!h-11 [@media(pointer:coarse)]:!w-11"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-micro text-ink-2">Repeat (times)</span>
                        <input
                          type="number"
                          min={1}
                          value={it.repeat_count}
                          onChange={(e) => updateItem(index, { repeat_count: e.target.value })}
                          className={INPUT}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-micro text-ink-2">Due (weeks, vs. event)</span>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={0}
                            value={it.weeks_before}
                            onChange={(e) => updateItem(index, { weeks_before: e.target.value })}
                            placeholder="None"
                            aria-label="Due, in weeks"
                            className={`${INPUT} !w-20 px-2`}
                          />
                          <select
                            value={it.after ? "after" : "before"}
                            onChange={(e) => updateItem(index, { after: e.target.value === "after" })}
                            aria-label="Before or after the event"
                            className={`${INPUT} flex-1`}
                          >
                            <option value="before">before</option>
                            <option value="after">after</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    {steps && (
                      <p className="text-micro text-ink-2">
                        Due {steps.join(", ")} weeks {it.after ? "after" : "before"} the event, one row each.
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addRow}
                className="self-start text-body font-medium text-navy hover:underline"
              >
                + Add another item
              </button>
              <span className="text-micro text-ink-2">
                &ldquo;Repeat&rdquo; makes numbered rows (a weekly check-in ×4 becomes &ldquo;— Week 1 of 4&rdquo;
                and so on). Due dates are worked out from the event&rsquo;s date, so they move with it.
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
