"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [showPicker, setShowPicker] = useState(false);
  const autoOpened = useRef(false);

  const repeating = event.recurring !== "None";
  const today = toDateStr(new Date());

  const load = useCallback(async () => {
    try {
      const loaded = unwrap(await getEventChecklist(event.id));
      setItems(loaded);
      // Reopening an event with unfinished work shows the list straight away,
      // so overdue items are never hidden behind a collapsed row.
      if (!autoOpened.current && loaded.some((i) => !i.done)) setOpen(true);
      autoOpened.current = true;
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
  // A Viewer has nothing to do on an event without a checklist.
  if (!hasItems && !isEditor) return null;
  const overdueCount = items.filter((i) => isOverdue(event.event_date, i.weeks_before, i.done, today)).length;
  const suggestedName = event.gathering_type ? SUGGESTED_TEMPLATE_BY_GATHERING_TYPE[event.gathering_type] : undefined;
  const listId = `event-checklist-${event.id}`;
  const coarse = "[@media(pointer:coarse)]:min-h-[44px]";

  async function add() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await applyChecklistTemplate(event.id, templateId));
      await load();
      setOpen(true);
      setShowPicker(false);
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
      setError(null);
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
      setOpen(false);
      autoOpened.current = false;
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the checklist.");
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        aria-label="Checklist template"
        className={`${INPUT} !min-h-[36px] max-w-[240px] flex-1 ${coarse}`}
      >
        <option value="">Choose a template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" className={coarse} onClick={add} disabled={!templateId} loading={busy}>
        {hasItems ? "Add missing items" : "Add checklist"}
      </Button>
    </div>
  );

  return (
    <div className="rounded-card border border-line">
      {hasItems ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={listId}
          className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-ui font-medium text-ink ${coarse}`}
        >
          <span className="flex flex-wrap items-center gap-2">
            <CheckSquareIcon className="!h-[18px] !w-[18px] text-ink-2" />
            Checklist
            <span className="rounded-pill bg-fill px-2 text-chip tabular-nums text-ink-2">
              {progress.done}/{progress.total}
            </span>
            {overdueCount > 0 && (
              <span className="rounded-pill bg-danger/10 px-2 text-chip font-medium text-danger">
                {overdueCount} overdue
              </span>
            )}
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
      <span className="sr-only" aria-live="polite">
        {hasItems ? `${progress.done} of ${progress.total} done` : ""}
      </span>

      {hasItems && open && (
        <ul id={listId} className="flex flex-col border-t border-line">
          {items.map((it) => {
            const due = dueDate(event.event_date, it.weeks_before);
            const overdue = isOverdue(event.event_date, it.weeks_before, it.done, today);
            return (
              <li key={it.id} className="border-b border-line last:border-b-0">
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={() => toggle(it)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F2A44]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-ui ${it.done ? "text-ink-2 line-through" : "text-ink"}`}>{it.item}</span>
                    <span className="block text-chip text-ink-2">
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
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {items[0]?.source_template && (
            <li className="px-4 py-2 text-micro text-ink-2">
              Copied from &ldquo;{items[0].source_template}&rdquo;. Changing the template later does not change this list.
            </li>
          )}
        </ul>
      )}

      {isEditor && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
          {!hasItems ? (
            <>
              {picker}
              {suggestedName && templateId && (
                <p className="text-micro text-ink-2">Suggested for this type of event: {suggestedName}.</p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {showPicker ? (
                picker
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className={`text-body font-medium text-navy hover:underline ${coarse}`}
                >
                  Add missing items from a template…
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className={`text-micro text-ink-2 hover:text-danger hover:underline ${coarse}`}
              >
                Remove checklist
              </button>
            </div>
          )}
        </div>
      )}

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
