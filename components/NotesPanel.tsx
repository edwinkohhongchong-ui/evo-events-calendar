"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createNoteComment } from "@/lib/noteCommentActions";
import { NoteCommentRow, NoteScope } from "@/lib/types";

const AUTHOR_NAME_KEY = "evo-author-name";

interface NotesPanelProps {
  title: string;
  subtitle: string;
  placeholder: string;
  scope: NoteScope;
  year?: number;
  month?: number;
  comments: NoteCommentRow[];
}

// A running, append-only log of comments (who wrote it, when) — replaces
// the old single freeform textarea (per-field autosave, silently overwritten
// by whoever typed last) with a proper log so a team can see who added
// what. Shared between the General Notes (left) and Month Notes (right)
// columns; scope/year/month decide which log a new comment is filed under.
export default function NotesPanel({
  title,
  subtitle,
  placeholder,
  scope,
  year,
  month,
  comments,
}: NotesPanelProps) {
  const router = useRouter();
  const [authorName, setAuthorNameState] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAuthorNameState(localStorage.getItem(AUTHOR_NAME_KEY));
    } catch {
      // Private-window/blocked storage — falls back to asking every time.
    }
  }, []);

  function saveAuthorName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(AUTHOR_NAME_KEY, trimmed);
    } catch {
      // Not fatal — the name still gets used for this comment via state.
    }
    setAuthorNameState(trimmed);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!authorName || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createNoteComment({
        scope,
        year: year ?? null,
        month: month ?? null,
        author_name: authorName,
        content: content.trim(),
      });
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving this note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">{title}</span>
      <p className="text-[11px] text-gray-400 -mt-1">{subtitle}</p>

      <div className="flex flex-col gap-2">
        {comments.length === 0 && <p className="text-xs text-gray-400">No notes yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="text-xs border-b border-gray-100 pb-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-navy truncate">{c.author_name}</span>
              <span className="text-gray-400 text-[10px] whitespace-nowrap">
                {format(parseISO(c.created_at), "d MMM, h:mm a")}
              </span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-2 flex flex-col gap-1.5">
        {authorName ? (
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            Commenting as <span className="font-medium text-gray-600">{authorName}</span>
            <button
              type="button"
              onClick={() => setAuthorNameState(null)}
              className="underline hover:no-underline"
            >
              change
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your name"
              className="border rounded px-2 py-1 text-xs flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={() => saveAuthorName(nameDraft)}
              disabled={!nameDraft.trim()}
              className="px-2 py-1 text-xs rounded bg-navy text-white disabled:opacity-50"
            >
              Set
            </button>
          </div>
        )}

        {authorName && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="border rounded px-2 py-1.5 text-sm resize-none"
            />
            <button
              type="submit"
              disabled={saving || !content.trim()}
              className="self-end px-2.5 py-1 text-xs rounded bg-navy text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
