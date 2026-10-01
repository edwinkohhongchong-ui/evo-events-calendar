"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChecklistTemplateWithItems } from "@/lib/types";
import { deleteChecklistTemplate } from "@/lib/checklistTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ChecklistTemplateModal from "./ChecklistTemplateModal";
import ConfirmModal from "./ConfirmModal";
import { unwrap } from "@/lib/actionResult";

type ModalState =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; template: ChecklistTemplateWithItems };

// Reusable checklist "playbooks" (e.g. "Big Event Prep") you can select for
// any event in the picker below to pre-load its lines straight into the
// drafted message — see RemindersForm.tsx. Deliberately NOT linked to the
// real Checklist tab/table (lib/checklistActions.ts, the "linked_event_id"
// system used for "Check Calendar") — this is message-composition content
// only, kept separate on purpose per explicit user feedback.
export default function ChecklistTemplatesSection({
  templates,
}: {
  templates: ChecklistTemplateWithItems[];
}) {
  const router = useRouter();
  const { record } = useUndo();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [open, setOpen] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistTemplateWithItems | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEscapeKey(() => setPendingDelete(null));

  function handleRemove(template: ChecklistTemplateWithItems) {
    setDeleteError(null);
    setPendingDelete(template);
  }

  async function handleConfirmRemove() {
    if (!pendingDelete) return;
    const template = pendingDelete;
    setRemovingId(template.id);
    try {
      const affected = unwrap(await deleteChecklistTemplate(template.id));
      record(`Delete message snippet "${template.name}"`, affected);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong deleting this message snippet."
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="border border-gray-200 rounded-md mb-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-navy"
      >
        <span>Message Checklist Snippets ({templates.length})</span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-2">
          <p className="text-xs text-gray-500 -mt-1">
            Pre-written checklist text you can drop into a drafted Telegram message. This does NOT
            update the real Checklist tab — selecting one here only adds text to the message,
            nothing is tracked.
          </p>
          {templates.map((t) => (
            <div
              key={t.id}
              onClick={() => setModal({ type: "edit", template: t })}
              className="border border-gray-200 rounded px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50"
            >
              <div>
                <div className="text-sm font-medium text-navy">{t.name}</div>
                <div className="text-xs text-gray-500">
                  {t.items.map((i) => i.item).join(", ") || "No items"}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(t);
                }}
                disabled={removingId === t.id}
                title={`Remove "${t.name}"`}
                className="text-gray-300 hover:text-red-600 disabled:opacity-30 leading-none shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">No message snippets yet.</p>
          )}
          <button
            type="button"
            onClick={() => setModal({ type: "add" })}
            className="self-start px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            + Add Snippet
          </button>
        </div>
      )}

      {modal.type !== "closed" && (
        <ChecklistTemplateModal
          mode={modal.type}
          template={modal.type === "edit" ? modal.template : undefined}
          onClose={() => setModal({ type: "closed" })}
          onSaved={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
              message={<>Delete &ldquo;{pendingDelete.name}&rdquo;?</>}
              error={deleteError}
              busy={removingId === pendingDelete.id}
              onClose={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemove}
            />
      )}
    </div>
  );
}
