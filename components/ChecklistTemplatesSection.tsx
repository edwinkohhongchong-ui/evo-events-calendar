"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChecklistTemplateWithItems } from "@/lib/types";
import { deleteChecklistTemplate } from "@/lib/checklistTemplateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import ChecklistTemplateModal from "./ChecklistTemplateModal";

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

  async function handleRemove(template: ChecklistTemplateWithItems) {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    setRemovingId(template.id);
    try {
      const affected = await deleteChecklistTemplate(template.id);
      record(`Delete checklist template "${template.name}"`, affected);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong deleting this template.");
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
        <span>Checklist Templates ({templates.length})</span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-2">
          <p className="text-xs text-gray-500 -mt-1">
            Reusable checklist text for drafted messages only — separate from the real Checklist
            tab. Select one per event below to pre-load its lines into the message.
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
            <p className="text-sm text-gray-400 text-center py-2">No templates yet.</p>
          )}
          <button
            type="button"
            onClick={() => setModal({ type: "add" })}
            className="self-start px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            + Add Template
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
    </div>
  );
}
