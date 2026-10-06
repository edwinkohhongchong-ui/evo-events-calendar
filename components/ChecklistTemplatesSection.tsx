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
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import { ROW_ACTION } from "./ui/tableStyles";
import { ChevronIcon, PlusIcon, TrashIcon } from "./icons";

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
      record(`Delete checklist template "${template.name}"`, affected);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong deleting this checklist template."
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-ui font-medium text-ink hover:bg-canvas"
      >
        <span>Checklist Templates ({templates.length})</span>
        <span className="text-ink-3">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-4">
          <p className="text-body text-ink-2">
            Reusable checklists. Drop one into a drafted Telegram message, or add it to an event from the event&rsquo;s details, where items can be ticked and given due dates (“weeks before”). This is separate from the monthly Checklist tab, which it never changes.
          </p>
          {templates.map((t) => (
            <div
              key={t.id}
              className="group flex items-center justify-between gap-2 rounded-ctl border border-line pr-2 transition-colors duration-fast hover:bg-canvas"
            >
              {/* Real button (not a clickable div) so the row is reachable by
                  Tab and opens on Enter/Space; delete stays a sibling button. */}
              <button
                type="button"
                onClick={() => setModal({ type: "edit", template: t })}
                className="min-w-0 flex-1 rounded-ctl py-2.5 pl-4 text-left"
              >
                <div className="truncate text-ui font-medium text-ink">{t.name}</div>
                <div className="truncate text-body text-ink-2">
                  {t.items.map((i) => i.item).join(", ") || "No items"}
                </div>
              </button>
              <span className={ROW_ACTION}>
                <IconButton
                  label={`Remove "${t.name}"`}
                  icon={<TrashIcon className="!h-4 !w-4" />}
                  onClick={() => handleRemove(t)}
                  disabled={removingId === t.id}
                  className="hover:!text-danger"
                />
              </span>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="py-2 text-center text-body text-ink-2">No checklist templates yet.</p>
          )}
          <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} className="self-start" onClick={() => setModal({ type: "add" })}>
            Add Checklist Template
          </Button>
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
