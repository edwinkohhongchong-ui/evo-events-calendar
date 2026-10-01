"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { createDayNote, deleteDayNote } from "@/lib/dayNoteActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { DayNoteRow } from "@/lib/types";
import AutoGrowTextarea from "./ui/AutoGrowTextarea";

interface DayNotesProps {
  dateStr: string;
  notes: DayNoteRow[];
}

// Short freeform tags for a day — plain green text, not an event card (e.g.
// "Send a card to friends" on a holiday). Self-contained: does its own
// Supabase writes and router.refresh(), same pattern as NotesPanel, so
// DayCell doesn't need to thread add/delete callbacks down.
export default function DayNotes({ dateStr, notes }: DayNotesProps) {
  const router = useRouter();
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  // The editor floats over the page (not inside the narrow day cell, which
  // the grid also clips), so a long note has room to wrap and stay visible.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const nearBottom = r.bottom > window.innerHeight - 280;
      setPos(
        nearBottom
          ? { bottom: window.innerHeight - r.top + 6, left, width }
          : { top: r.bottom + 6, left, width }
      );
    };
    place();
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!cardRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEscapeKey(() => {
    if (open) setOpen(false);
  });

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const affected = await createDayNote(dateStr, draft.trim());
      record(`Add note "${draft.trim()}"`, affected);
      setDraft("");
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
      const affected = await deleteDayNote(id);
      record(note ? `Delete note "${note.content}"` : "Delete note", affected);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that note.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5">
      {notes.map((n) => (
        <span
          key={n.id}
          className="text-micro font-medium text-green-700 break-words"
          title={n.content}
        >
          {n.content}
        </span>
      ))}

      {isEditor && (
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          title="Add a note to this day"
          className={[
            "self-start text-micro text-ink-3 hover:text-green-700 leading-none rounded-chip px-0.5 py-0.5 transition-opacity duration-fast",
            // Quiet until the cell is hovered/focused; always visible when open
            // or on touch devices. Still reachable by keyboard (focus reveals it).
            open
              ? "opacity-100"
              : "opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60",
          ].join(" ")}
        >
          {open ? "▾ note" : "+ note"}
        </button>
      )}

      {isEditor && open && pos &&
        createPortal(
          <div
            ref={cardRef}
            data-day-note-editor
            style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
            className="z-40 flex flex-col gap-2 bg-surface rounded-card shadow-pop p-3 max-h-[70vh] overflow-y-auto"
          >
            <p className="text-micro font-medium text-ink-2">Note for {dateStr}</p>
            {notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2">
                <span className="text-chip text-green-700 flex-1 break-words">{n.content}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(n.id)}
                  disabled={removingId === n.id}
                  title="Delete this note"
                  aria-label="Delete this note"
                  className="leading-none text-ink-3 hover:text-danger disabled:opacity-30 shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
            <form onSubmit={handleAdd} className="flex flex-col gap-2">
              <AutoGrowTextarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter saves; Shift+Enter starts a new line.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Add a note…"
                className="border border-line-strong rounded-ctl px-2.5 py-1.5 text-chip w-full"
              />
              <button
                type="submit"
                disabled={saving || !draft.trim()}
                className="self-end px-3 py-1 text-chip rounded-pill bg-navy text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </form>
            {error && <p className="text-micro text-danger">{error}</p>}
          </div>,
          document.body
        )}
    </div>
  );
}
