"use client";

import { useState, FormEvent } from "react";
import { ChecklistTemplateWithItems } from "@/lib/types";
import { saveChecklistTemplate, deleteChecklistTemplate } from "@/lib/checklistTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import ConfirmDialog from "./ConfirmDialog";

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
}

const EMPTY_ITEM: DraftItem = { item: "", repeat_count: "1" };

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
      ? template.items.map((i) => ({ item: i.item, repeat_count: String(i.repeat_count) }))
      : [EMPTY_ITEM]
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      .map((it) => ({ item: it.item.trim(), repeat_count: Number(it.repeat_count) || 1 }))
      .filter((it) => it.item.length > 0);
    if (cleanItems.length === 0) {
      setFormError("Add at least one item.");
      return;
    }

    setSaving(true);
    try {
      const affected = await saveChecklistTemplate(template?.id ?? null, name.trim(), cleanItems);
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
      const affected = await deleteChecklistTemplate(template.id);
      record(`Delete checklist template "${template.name}"`, affected);
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
        className="bg-white rounded-lg shadow-lg w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-navy mb-3">
          {mode === "add" ? "Add Checklist Template" : "Edit Checklist Template"}
        </h2>

        {!confirmDelete ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Big Event Prep"
                className="border rounded px-2 py-1"
                required
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm">Items</span>
              {items.map((it, index) => (
                <div key={index} className="flex items-start gap-2">
                  <input
                    value={it.item}
                    onChange={(e) => updateItem(index, { item: e.target.value })}
                    placeholder="Invite / e-invite (at least 4 weeks before event)"
                    className="border rounded px-2 py-1 text-sm flex-1"
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    ×
                    <input
                      type="number"
                      min={1}
                      value={it.repeat_count}
                      onChange={(e) => updateItem(index, { repeat_count: e.target.value })}
                      title="Repeat this many times (e.g. 4 for a weekly check-in over 4 weeks) — each gets its own numbered checklist row when applied"
                      className="border rounded px-1.5 py-1 w-14"
                    />
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
                className="self-start text-xs text-navy hover:underline"
              >
                + Add another item
              </button>
              <span className="text-xs text-gray-400">
                The × count repeats an item (e.g. a weekly check-in over 4 weeks becomes 4
                separate checklist rows, numbered &ldquo;— Week 1 of 4&rdquo; etc.) when applied
                to an event.
              </span>
            </div>

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
