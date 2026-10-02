"use client";

import { useState, FormEvent } from "react";
import { LevelRow, ColorValue } from "@/lib/types";
import { createLevel, updateLevel, deleteLevel } from "@/lib/levelActions";
import { suggestLevelColor } from "@/lib/levelColor";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";
import { unwrap } from "@/lib/actionResult";
import ModalShell from "./ui/ModalShell";
import ColorPicker from "./ui/ColorPicker";
import Button from "./ui/Button";
import { INPUT, LABEL } from "./ui/fieldStyles";
import { useIsEditor } from "@/lib/roleContext";

interface LevelModalProps {
  mode: "add" | "edit";
  level?: LevelRow;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function LevelModal({
  mode,
  level,
  nextSortOrder,
  onClose,
  onSaved,
  onDeleted,
}: LevelModalProps) {
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [name, setName] = useState(level?.name ?? "");
  const [colorKey, setColorKey] = useState<ColorValue>(level?.color_key ?? suggestLevelColor(name));
  // Once the user explicitly picks a swatch, stop following the name-based
  // suggestion — an existing stored color counts as already "touched".
  const [colorTouched, setColorTouched] = useState(!!level?.color_key);
  const [sortOrder, setSortOrder] = useState(String(level?.sort_order ?? nextSortOrder));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEscapeKey(onClose);

  function handleNameChange(value: string) {
    setName(value);
    if (!colorTouched) {
      setColorKey(suggestLevelColor(value));
    }
  }

  function handleColorPick(key: ColorValue) {
    setColorKey(key);
    setColorTouched(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        name: name.trim(),
        color_key: colorKey,
        sort_order: Number(sortOrder) || 0,
      };
      if (mode === "add") {
        const affected = unwrap(await createLevel(values));
        record(`Add category "${values.name}"`, affected);
      } else if (level) {
        const affected = unwrap(await updateLevel(level.id, values));
        record(`Edit category "${values.name}"`, affected);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong saving this category.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!level) return;
    setSaving(true);
    setFormError(null);
    try {
      const affected = unwrap(await deleteLevel(level.id));
      record(`Delete category "${level.name}"`, affected);
      onDeleted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong deleting this category.");
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
          Cancel
        </Button>
        <Button type="submit" form="modal-form" loading={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );

  return (
    <ModalShell title={mode === "add" ? "Add Category" : "Edit Category"} onClose={onClose} footer={footer} widthClass="max-w-md">
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
                onChange={(e) => handleNameChange(e.target.value)}
                className={INPUT}
                required
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Color</span>
              <ColorPicker value={colorKey} onChange={handleColorPick} />
            </div>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Order in legend/list</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className={INPUT}
              />
            </label>

          </form>
        ) : (
          <ConfirmDialog
            message={<>Delete &ldquo;{level?.name}&rdquo;?</>}
            error={formError}
            busy={saving}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        )}
    </ModalShell>
  );
}
