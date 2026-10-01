"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDayNote, deleteDayNote } from "@/lib/dayNoteActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { DayNoteRow } from "@/lib/types";

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
          className="text-micro font-medium text-green-700 truncate"
          title={n.content}
        >
          {n.content}
        </span>
      ))}

      {isEditor && (
        <button
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

      {isEditor && open && (
        <div className="flex flex-col gap-1 border border-line rounded-chip p-1.5 bg-surface">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-1">
              <span className="text-micro text-green-700 flex-1 break-words">{n.content}</span>
              <button
                type="button"
                onClick={() => handleRemove(n.id)}
                disabled={removingId === n.id}
                title="Delete this note"
                className="leading-none text-gray-300 hover:text-red-600 disabled:opacity-30 shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          <form onSubmit={handleAdd} className="flex gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Send a card to friends…"
              className="border border-line-strong rounded-chip px-1.5 py-0.5 text-micro flex-1 min-w-0"
            />
            <button
              type="submit"
              disabled={saving || !draft.trim()}
              className="px-2 py-0.5 text-micro rounded-pill bg-navy text-white disabled:opacity-50 shrink-0"
            >
              {saving ? "…" : "Add"}
            </button>
          </form>
          {error && <p className="text-micro text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
