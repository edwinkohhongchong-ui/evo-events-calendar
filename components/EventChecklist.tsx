"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { EventRow, EventChecklistItemRow, ChecklistTemplateWithItems } from "@/lib/types";
import {
  applyChecklistTemplate,
  getChecklistTemplateOptions,
  getEventChecklist,
  removeEventChecklist,
  setChecklistItemDone,
} from "@/lib/eventChecklistActions";
import { unwrap } from "@/lib/actionResult";
import { dueDate, isOverdue, progressOf, SUGGESTED_TEMPLATE_BY_GATHERING_TYPE } from "@/lib/eventChecklist";
import { parseDateStr, toDateStr } from "@/lib/dates";
import { useIsEditor } from "@/lib/roleContext";
import ConfirmModal from "./ConfirmModal";
import Button from "./ui/Button";
import { ChevronIcon, CheckSquareIcon } from "./icons";
import { INPUT } from "./ui/fieldStyles";

const AUTHOR_NAME_KEY = "evo-author-name";

function authorName(): string | null {
  try {
    return localStorage.getItem(AUTHOR_NAME_KEY);
  } catch {
    return null;
  }
}

// Per-event checklist inside the event details view. Editors add (from a
// template) or remove it; Editors and Viewers tick items. One-off events only.
export default function EventChecklist({ event }: { event: EventRow }) {
  const router = useRouter();
  const isEditor = useIsEditor();
  const [items, setItems] = useState<EventChecklistItemRow[] | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const repeating = event.recurring !== "None";
  const today = toDateStr(new Date());

  const load = useCallback(async () => {
    try {
      setItems(unwrap(await getEventChecklist(event.id)));
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "Couldn't load this checklist.");
    }
  }, [event.id]);

  useEffect(() => {
    if (repeating) return;
    void load();
  }, [load, repeating]);

  // Editors need the template list for the picker; preselect the suggested one.
  useEffect(() => {
    if (repeating || !isEditor) return;
    (async () => {
      try {
        const list = unwrap(await getChecklistTemplateOptions());
        setTemplates(list);
        const suggestedName = event.gathering_type ? SUGGESTED_TEMPLATE_BY_GATHERING_TYPE[event.gathering_type] : undefined;
        const suggested = suggestedName ? list.find((t) => t.name === suggestedName) : undefined;
        if (suggested) setTemplateId(suggested.id);
      } catch {
        /* picker stays empty; the error shows if they try to add */
      }
    })();
  }, [repeating, isEditor, event.gathering_type]);

  if (repeating) {
    return isEditor ? (
      <p className="text-micro text-ink-2">Checklists aren&rsquo;t available on repeating events yet.</p>
    ) : null;
  }
  if (items === null) return null;

  const progress = progressOf(items);
  const hasItems = items.length > 0;
  const suggestedName = event.gathering_type ? SUGGESTED_TEMPLATE_BY_GATHERING_TYPE[event.gathering_type] : undefined;

  async function add() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await applyChecklistTemplate(event.id, templateId));
      await load();
      setOpen(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the checklist.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: EventChecklistItemRow) {
    const next = !item.done;
    const stamp = next ? new Date().toISOString() : null;
    const by = next ? authorName() : null;
    // Optimistic: flip it now, restore if the save fails.
    setItems((prev) => prev && prev.map((i) => (i.id === item.id ? { ...i, done: next, done_at: stamp, done_by: by } : i)));
    try {
      unwrap(await setChecklistItemDone(item.id, next, authorName()));
      router.refresh();
    } catch (err) {
      setItems((prev) => prev && prev.map((i) => (i.id === item.id ? item : i)));
      setError(err instanceof Error ? err.message : "Couldn't update that item.");
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      unwrap(await removeEventChecklist(event.id));
      setConfirmRemove(false);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the checklist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line">
      {hasItems ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-ui font-medium text-ink"
        >
          <span className="flex items-center gap-2">
            <CheckSquareIcon className="!h-[18px] !w-[18px] text-ink-2" />
            Checklist
            <span className="rounded-pill bg-fill px-2 text-micro tabular-nums text-ink-2">
              {progress.done}/{progress.total}
            </span>
          </span>
          <span className="text-ink-3">
            <ChevronIcon open={open} />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 text-ui font-medium text-ink">
          <CheckSquareIcon className="!h-[18px] !w-[18px] text-ink-2" />
          Checklist
        </div>
      )}

      {hasItems && open && (
        <ul className="flex flex-col border-t border-line">
          {items.map((it) => {
            const due = dueDate(event.event_date, it.weeks_before);
            const overdue = isOverdue(event.event_date, it.weeks_before, it.done, today);
            return (
              <li key={it.id} className="flex items-start gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() => toggle(it)}
                  aria-label={`Done: ${it.item}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#1F2A44]"
                />
                <div className="min-w-0 flex-1">
                  <div className={it.done ? "text-ui text-ink-3 line-through" : "text-ui text-ink"}>{it.item}</div>
                  <div className="text-micro text-ink-2">
                    {it.done && it.done_at ? (
                      <>
                        Done{it.done_by ? ` by ${it.done_by}` : ""} · {format(new Date(it.done_at), "d MMM")}
                      </>
                    ) : due ? (
                      <span className={overdue ? "font-medium text-danger" : ""}>
                        {overdue ? "Overdue · " : "Due "}
                        {format(parseDateStr(due), "d MMM")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
          {items[0]?.source_template && (
            <li className="px-4 py-2 text-micro text-ink-3">
              Copied from &ldquo;{items[0].source_template}&rdquo;. Changing the template later does not change this list.
            </li>
          )}
        </ul>
      )}

      {isEditor && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label="Checklist template"
              className={`${INPUT} !min-h-[36px] max-w-[220px] flex-1`}
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={add} disabled={!templateId} loading={busy}>
              {hasItems ? "Re-add missing items" : "Add checklist"}
            </Button>
            {hasItems && (
              <Button
                size="sm"
                variant="ghost"
                className="!text-danger hover:!bg-danger/10"
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </Button>
            )}
          </div>
          {!hasItems && suggestedName && templateId && (
            <p className="text-micro text-ink-2">Suggested for this type of event: {suggestedName}.</p>
          )}
        </div>
      )}
      {!isEditor && !hasItems && <p className="px-4 pb-3 text-micro text-ink-2">No checklist on this event.</p>}

      {error && (
        <p role="alert" className="mx-4 mb-3 rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
          {error}
        </p>
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remove checklist?"
          message="Remove this event's whole checklist, including what has been ticked?"
          confirmLabel="Yes, remove"
          busyLabel="Removing…"
          busy={busy}
          onClose={() => setConfirmRemove(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
