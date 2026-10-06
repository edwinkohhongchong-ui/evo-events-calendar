"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { EventRow, EventChecklistItemRow, ChecklistTemplateWithItems } from "@/lib/types";
import {
  addChecklistItem,
  applyChecklistTemplate,
  removeChecklistItem,
  getChecklistTemplateOptions,
  getEventChecklist,
  removeEventChecklist,
  setChecklistItemDone,
  editChecklistItem,
} from "@/lib/eventChecklistActions";
import { unwrap } from "@/lib/actionResult";
import { DONE_BY_MAX, dueDate, isOverdue, progressOf, SUGGESTED_TEMPLATE_BY_GATHERING_TYPE } from "@/lib/eventChecklist";
import { parseDateStr, todayStr } from "@/lib/dates";
import { useIsEditor } from "@/lib/roleContext";
import { useUndo } from "@/lib/undo/UndoProvider";
import { OWNER_MAX, normalizeOwner } from "@/lib/owner";
import ConfirmModal from "./ConfirmModal";
import Button from "./ui/Button";
import { ChevronIcon, CheckSquareIcon, XIcon } from "./icons";
import { INPUT } from "./ui/fieldStyles";

const AUTHOR_NAME_KEY = "evo-author-name";

function authorName(): string | null {
  try {
    return localStorage.getItem(AUTHOR_NAME_KEY)?.trim().slice(0, DONE_BY_MAX) || null;
  } catch {
    return null;
  }
}

// Per-event checklist inside the event details view. Editors add (from a
// template) or remove it and edit items; Editors and Viewers tick items. One-off events only.
export default function EventChecklist({ event, ownerOptions = [] }: { event: EventRow; ownerOptions?: string[] }) {
  const router = useRouter();
  const isEditor = useIsEditor();
  const { record } = useUndo();
  const [items, setItems] = useState<EventChecklistItemRow[] | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const autoOpened = useRef(false);
  const [newItem, setNewItem] = useState("");
  // New items default to the event's owner; stays as typed between adds.
  const [newOwner, setNewOwner] = useState(event.owner ?? "");
  // The one row being edited inline (Editors only); `focus` is the field they clicked.
  const [editing, setEditing] = useState<{ id: string; item: string; owner: string; focus: "item" | "owner" } | null>(
    null
  );
  const [savingEdit, setSavingEdit] = useState(false);

  const repeating = event.recurring !== "None";
  const today = todayStr();

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
    return isEditor ? <p className="text-micro text-ink-2">Checklists aren&rsquo;t available on repeating events yet.</p> : null;
  }
  if (items === null) return null;

  const progress = progressOf(items);
  const hasItems = items.length > 0;
  // A Viewer has nothing to do on an event without a checklist.
  if (!hasItems && !isEditor) return null;
  const overdueCount = items.filter((i) => isOverdue(event.event_date, i.weeks_before, i.done, today)).length;
  const suggestedName = event.gathering_type ? SUGGESTED_TEMPLATE_BY_GATHERING_TYPE[event.gathering_type] : undefined;
  const listId = `event-checklist-${event.id}`;
  const coarse = "[@media(pointer:coarse)]:!min-h-[44px]";
  const ownerListId = `owner-options-${event.id}`;

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

  async function addItem() {
    const text = newItem.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await addChecklistItem(event.id, text, null, normalizeOwner(newOwner) || null));
      setNewItem("");
      await load();
      setOpen(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that item.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: EventChecklistItemRow, focus: "item" | "owner") {
    setEditing({ id: item.id, item: item.item, owner: item.owner ?? "", focus });
  }

  async function saveEdit(item: EventChecklistItemRow) {
    if (!editing || savingEdit) return;
    const draft = editing;
    const text = draft.item.trim();
    if (!text) {
      setError("Type what needs doing.");
      return;
    }
    const owner = normalizeOwner(draft.owner) || null;
    if (text === item.item && owner === (item.owner ?? null)) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    // Optimistic: show it now; on failure restore the row and reopen the editor with what was typed.
    setItems((prev) => prev && prev.map((i) => (i.id === item.id ? { ...i, item: text, owner } : i)));
    setEditing(null);
    try {
      const affected = unwrap(await editChecklistItem(item.id, { item: text, owner }));
      record(`Edit checklist item "${text}"`, affected);
      setError(null);
      router.refresh();
    } catch (err) {
      setItems((prev) => prev && prev.map((i) => (i.id === item.id ? item : i)));
      setEditing(draft);
      setError(err instanceof Error ? err.message : "Couldn't update that item.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeItem(item: EventChecklistItemRow) {
    // Optimistic: drop it now, put it back if the delete fails.
    setItems((prev) => prev && prev.filter((i) => i.id !== item.id));
    try {
      unwrap(await removeChecklistItem(item.id));
      setError(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that item.");
      await load();
    }
  }

  // Done/due line under an item. For Editors the owner name opens the inline editor.
  function subline(it: EventChecklistItemRow, due: string | null, overdue: boolean) {
    if (!(it.done && it.done_at) && !due && !it.owner) return null;
    return (
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
        {it.owner && (
          <>
            {it.done || due ? " · " : ""}
            {isEditor ? (
              <button
                type="button"
                onClick={() => startEdit(it, "owner")}
                title="Change owner"
                className="break-words text-left hover:text-navy hover:underline"
              >
                Owner: {it.owner}
              </button>
            ) : (
              <span>Owner: {it.owner}</span>
            )}
          </>
        )}
      </span>
    );
  }

  const ownerDatalist = (
    <datalist id={ownerListId}>
      {ownerOptions.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
  const addForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void addItem();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {ownerDatalist}
      <input
        value={newItem}
        onChange={(e) => setNewItem(e.target.value)}
        placeholder="Add an item…"
        aria-label="Add an item to this checklist"
        maxLength={200}
        className={`${INPUT} !min-h-[36px] !w-full basis-full min-w-0 ${coarse}`}
      />
      <input
        value={newOwner}
        onChange={(e) => setNewOwner(e.target.value)}
        list={ownerListId}
        placeholder="Owner"
        aria-label="Owner of the new item"
        maxLength={OWNER_MAX}
        autoComplete="off"
        className={`${INPUT} !min-h-[36px] !w-auto min-w-0 flex-1 ${coarse}`}
      />
      <Button type="submit" size="sm" variant="secondary" className={`shrink-0 ${coarse}`} disabled={!newItem.trim()} loading={busy}>
        Add item
      </Button>
    </form>
  );

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
              <span className="rounded-pill bg-danger/10 px-2 text-chip font-medium text-danger">{overdueCount} overdue</span>
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
              <li key={it.id} className="group/item flex items-stretch border-b border-line last:border-b-0">
                {editing?.id === it.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(it);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        // Cancel only this editor, not the modal around it.
                        e.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-2.5"
                  >
                    <input
                      autoFocus={editing.focus === "item"}
                      value={editing.item}
                      onChange={(e) => setEditing({ ...editing, item: e.target.value })}
                      maxLength={200}
                      aria-label="Checklist item"
                      className={`${INPUT} !min-h-[36px] min-w-0 coarse:!min-h-[44px]`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        autoFocus={editing.focus === "owner"}
                        value={editing.owner}
                        onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                        list={ownerListId}
                        maxLength={OWNER_MAX}
                        autoComplete="off"
                        placeholder="Owner"
                        aria-label="Owner"
                        className={`${INPUT} !min-h-[36px] !w-auto min-w-0 flex-1 basis-32 coarse:!min-h-[44px]`}
                      />
                      <div className="flex shrink-0 gap-2">
                        <Button type="submit" size="sm" variant="primary" disabled={!editing.item.trim()} loading={savingEdit}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </form>
                ) : isEditor ? (
                  <>
                    <label className="flex shrink-0 cursor-pointer items-start py-2.5 pl-4 pr-3 hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={() => toggle(it)}
                        aria-label={`Done: ${it.item}`}
                        className="mt-0.5 h-5 w-5 accent-[#1F2A44]"
                      />
                    </label>
                    <div className="min-w-0 flex-1 py-2.5">
                      <button
                        type="button"
                        onClick={() => startEdit(it, "item")}
                        title="Edit this item"
                        className={`block w-full break-words text-left text-ui hover:text-navy hover:underline ${
                          it.done ? "text-ink-2 line-through" : "text-ink"
                        }`}
                      >
                        {it.item}
                      </button>
                      {subline(it, due, overdue)}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(it, "item")}
                      aria-label={`Edit item: ${it.item}`}
                      className="shrink-0 px-2 text-chip font-medium text-ink-2 underline underline-offset-2 hover:bg-canvas hover:text-navy md:opacity-0 md:group-hover/item:opacity-100 focus-visible:opacity-100 coarse:min-h-[44px] coarse:opacity-100"
                    >
                      Edit
                    </button>
                  </>
                ) : (
                  <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-canvas">
                    <input
                      type="checkbox"
                      checked={it.done}
                      onChange={() => toggle(it)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F2A44]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block break-words text-ui ${it.done ? "text-ink-2 line-through" : "text-ink"}`}>{it.item}</span>
                      {subline(it, due, overdue)}
                    </span>
                  </label>
                )}
                {isEditor && editing?.id !== it.id && (
                  <button
                    type="button"
                    onClick={() => removeItem(it)}
                    aria-label={`Remove item: ${it.item}`}
                    title="Remove this item"
                    className="flex w-11 shrink-0 items-center justify-center text-ink-3 hover:bg-canvas hover:text-danger md:opacity-0 md:group-hover/item:opacity-100 focus-visible:opacity-100 coarse:opacity-100"
                  >
                    <XIcon className="!h-4 !w-4" />
                  </button>
                )}
              </li>
            );
          })}
          {isEditor && <li className="border-t border-line px-4 py-2.5">{addForm}</li>}
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
              {suggestedName && templateId && <p className="text-micro text-ink-2">Suggested for this type of event: {suggestedName}.</p>}
              <p className="text-micro text-ink-2">Or add your own items (no template needed):</p>
              {addForm}
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
