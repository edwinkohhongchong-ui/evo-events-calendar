"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { createDayNote, updateDayNote, deleteDayNote } from "@/lib/dayNoteActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { DayNoteRow } from "@/lib/types";
import AutoGrowTextarea from "./ui/AutoGrowTextarea";
import DetailsText, { DetailsMarker } from "./ui/DetailsText";
import { unwrap } from "@/lib/actionResult";
import { DAY_NOTE_DETAILS_MAX } from "@/lib/dayNoteDetails";

interface DayNotesProps {
  dateStr: string;
  notes: DayNoteRow[];
}

// Short freeform tags for a day — plain green text, not an event card (e.g.
// "Send a card to friends" on a holiday). Self-contained: does its own
// Supabase writes and router.refresh(), same pattern as NotesPanel, so
// DayCell doesn't need to thread add/edit/delete callbacks down. Editors get
// an Edit button per note plus "+ Add note"; both open the same floating card.
// Viewers click a note to open a read-only card with its details.
export default function DayNotes({ dateStr, notes }: DayNotesProps) {
  const router = useRouter();
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [open, setOpen] = useState(false);
  // Which note the card is editing; null = the card is only offering "add".
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [draft, setDraft] = useState("");
  const [draftDetails, setDraftDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whichever button opened the card (Edit or + Add note) — the card anchors to it.
  const anchorRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  // The editor floats over the page (not inside the narrow day cell, which
  // the grid also clips), so a long note has room to wrap and stay visible.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const nearBottom = r.bottom > window.innerHeight - 340;
      setPos(
        nearBottom
          ? { bottom: window.innerHeight - r.top + 6, left, width }
          : { top: r.bottom + 6, left, width }
      );
    };
    place();
    const close = () => setOpen(false);
    // Scrolling inside the editor itself (long note) must not dismiss it.
    const closeOnPageScroll = (e: Event) => {
      if (e.target instanceof Node && cardRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!cardRef.current?.contains(t) && !anchorRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnPageScroll, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnPageScroll, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, editingId]);

  useEscapeKey(() => {
    if (open) setOpen(false);
  });

  function openFor(anchor: HTMLElement, note: DayNoteRow | null) {
    // Clicking the same trigger again closes the card.
    if (open && anchorRef.current === anchor) {
      setOpen(false);
      return;
    }
    anchorRef.current = anchor;
    setEditingId(note ? note.id : null);
    setEditDraft(note ? note.content : "");
    setEditDetails(note?.details ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingNote) return;
    const next = editDraft.trim();
    if (!next) {
      setError("A note can't be empty. Use Remove note to delete it.");
      return;
    }
    const nextDetails = editDetails.trim();
    const detailsChanged = nextDetails !== (editingNote.details ?? "").trim();
    if (next === editingNote.content && !detailsChanged) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Unchanged details are not sent, so title-only edits work before migration 027.
      const affected = unwrap(
        await updateDayNote(editingNote.id, next, detailsChanged ? nextDetails : undefined)
      );
      record(`Edit note "${next}"`, affected);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const affected = unwrap(await createDayNote(dateStr, draft.trim(), draftDetails.trim() || undefined));
      record(`Add note "${draft.trim()}"`, affected);
      setDraft("");
      setDraftDetails("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const note = notes.find((n) => n.id === id);
    setRemovingId(id);
    setError(null);
    try {
      const affected = unwrap(await deleteDayNote(id));
      record(note ? `Delete note "${note.content}"` : "Delete note", affected);
      if (editingId === id) setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that note.");
    } finally {
      setRemovingId(null);
    }
  }

  // Quiet until the cell is hovered/focused; always visible when the card is
  // open or on touch devices. Still reachable by keyboard (focus reveals it).
  const reveal = (active: boolean) =>
    active
      ? "opacity-100"
      : "opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";
  // Cmd/Ctrl+Enter saves from a details box; plain Enter is a new line there.
  const submitOnModEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };
  const detailsBox = "border border-line-strong rounded-ctl px-2.5 py-1.5 text-chip w-full";
  const smallBtn =
    "text-micro leading-none rounded-pill px-1.5 py-0.5 transition-opacity duration-fast coarse:min-h-[44px] coarse:min-w-[44px]";

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5">
      {notes.map((n) => (
        <div key={n.id} className="flex items-start gap-1">
          <button
            type="button"
            onClick={(e) => openFor(e.currentTarget, n)}
            title={isEditor ? "Click to edit this note" : "Click to see this note"}
            className="min-w-0 flex-1 text-left text-micro font-medium text-green-700 break-words hover:underline"
          >
            {n.content}
            {n.details && <DetailsMarker />}
          </button>
          {isEditor && (
            <button
              type="button"
              onClick={(e) => openFor(e.currentTarget, n)}
              aria-label={`Edit note: ${n.content}`}
              title="Edit or remove this note"
              className={[
                smallBtn,
                "shrink-0 text-ink-2 hover:text-green-700 hover:bg-green-700/10",
                reveal(open && editingId === n.id),
              ].join(" ")}
            >
              Edit
            </button>
          )}
        </div>
      ))}

      {isEditor && (
        <button
          type="button"
          onClick={(e) => openFor(e.currentTarget, null)}
          title="Add a note to this day"
          className={[smallBtn, "self-start text-ink-3 hover:text-green-700", reveal(open && editingId === null)].join(" ")}
        >
          + Add note
        </button>
      )}

      {open && pos &&
        createPortal(
          <div
            ref={cardRef}
            data-day-note-editor
            style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
            className="z-40 flex flex-col gap-2 bg-surface rounded-card shadow-pop p-3 max-h-[70vh] overflow-y-auto"
          >
            <p className="text-micro font-medium text-ink-2">
              {isEditor ? "Notes" : "Note"} for {dateStr}
            </p>

            {!isEditor && editingNote && (
              <>
                <p className="text-chip font-medium text-green-700 whitespace-pre-wrap break-words">
                  {editingNote.content}
                </p>
                <DetailsText text={editingNote.details} className="text-chip max-h-60 overflow-y-auto" />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-3 py-1 text-chip rounded-pill text-ink-2 hover:bg-black/5 coarse:min-h-[44px]"
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {isEditor && editingNote && (
              <form onSubmit={handleSaveEdit} className="flex flex-col gap-2">
                <AutoGrowTextarea
                  key={editingNote.id}
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter saves; Shift+Enter starts a new line.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  aria-label="Edit note"
                  className="border border-line-strong rounded-ctl px-2.5 py-1.5 text-chip w-full text-green-700"
                />
                <AutoGrowTextarea
                  value={editDetails}
                  onChange={(e) => setEditDetails(e.target.value)}
                  onKeyDown={submitOnModEnter}
                  maxLength={DAY_NOTE_DETAILS_MAX}
                  maxHeightPx={200}
                  aria-label="Note details (optional)"
                  placeholder="Details (optional)"
                  className={detailsBox}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleRemove(editingNote.id)}
                    disabled={removingId === editingNote.id || saving}
                    className="px-3 py-1 text-chip rounded-pill text-danger hover:bg-danger/10 disabled:opacity-50 coarse:min-h-[44px]"
                  >
                    {removingId === editingNote.id ? "Removing…" : "Remove note"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="px-3 py-1 text-chip rounded-pill text-ink-2 hover:bg-black/5 coarse:min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !editDraft.trim()}
                      className="px-3 py-1 text-chip rounded-pill bg-navy text-white disabled:opacity-50 coarse:min-h-[44px]"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {isEditor && (
              <form onSubmit={handleAdd} className={["flex flex-col gap-2", editingNote ? "border-t border-line pt-2" : ""].join(" ")}>
                <AutoGrowTextarea
                  key={editingNote ? "add-secondary" : "add-primary"}
                  autoFocus={!editingNote}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  aria-label={editingNote ? "Add another note" : "Add a note"}
                  placeholder={editingNote ? "Add another note…" : "Add a note…"}
                  className="border border-line-strong rounded-ctl px-2.5 py-1.5 text-chip w-full"
                />
                <AutoGrowTextarea
                  value={draftDetails}
                  onChange={(e) => setDraftDetails(e.target.value)}
                  onKeyDown={submitOnModEnter}
                  maxLength={DAY_NOTE_DETAILS_MAX}
                  maxHeightPx={200}
                  aria-label="New note details (optional)"
                  placeholder="Details (optional)"
                  className={detailsBox}
                />
                <div className="flex items-center justify-end gap-2">
                  {!editingNote && (
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="px-3 py-1 text-chip rounded-pill text-ink-2 hover:bg-black/5 coarse:min-h-[44px]"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving || !draft.trim()}
                    className="px-3 py-1 text-chip rounded-pill bg-navy text-white disabled:opacity-50 coarse:min-h-[44px]"
                  >
                    {saving ? "Saving…" : "+ Add note"}
                  </button>
                </div>
              </form>
            )}
            {error && <p className="text-micro text-danger">{error}</p>}
          </div>,
          document.body
        )}
    </div>
  );
}
