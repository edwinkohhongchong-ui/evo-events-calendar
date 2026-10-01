"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createNoteComment, deleteNoteComment } from "@/lib/noteCommentActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useIsEditor } from "@/lib/roleContext";
import { NoteCommentRow, NoteScope } from "@/lib/types";
import { useEscapeKey } from "@/lib/useEscapeKey";
import ConfirmDialog from "./ConfirmDialog";

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

// A running, append-only log of comments (who wrote it, when), with one
// level of threading (replies) and removal — replaces the old single
// freeform textarea. Shared between the General Notes (left) and Month
// Notes (right) columns; scope/year/month decide which log a new top-level
// comment or reply is filed under.
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
  const { record } = useUndo();
  const isEditor = useIsEditor();
  const [authorName, setAuthorNameState] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEscapeKey(() => setPendingDeleteId(null));

  useEffect(() => {
    try {
      setAuthorNameState(localStorage.getItem(AUTHOR_NAME_KEY));
    } catch {
      // Private-window/blocked storage — falls back to asking every time.
    }
  }, []);

  // Top-level list stays in the newest-first order the server sent; each
  // thread's own replies are shown oldest-first underneath it, like a
  // conversation rather than a second log.
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: NoteCommentRow[] = [];
    const replies = new Map<string, NoteCommentRow[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const list = replies.get(c.parent_id) ?? [];
        list.push(c);
        replies.set(c.parent_id, list);
      } else {
        top.push(c);
      }
    }
    for (const list of Array.from(replies.values())) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

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
      const affected = await createNoteComment({
        scope,
        year: year ?? null,
        month: month ?? null,
        author_name: authorName,
        content: content.trim(),
      });
      record("Add note", affected);
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving this note.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplySubmit(parentId: string) {
    if (!authorName || !replyDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const affected = await createNoteComment({
        scope,
        year: year ?? null,
        month: month ?? null,
        author_name: authorName,
        content: replyDraft.trim(),
        parent_id: parentId,
      });
      record("Add reply", affected);
      setReplyDraft("");
      setReplyingTo(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving this reply.");
    } finally {
      setSaving(false);
    }
  }

  function handleRemove(id: string) {
    setDeleteError(null);
    setPendingDeleteId(id);
  }

  async function handleConfirmRemove() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setRemovingId(id);
    try {
      const affected = await deleteNoteComment(id);
      record("Delete note", affected);
      setPendingDeleteId(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong deleting this note.");
    } finally {
      setRemovingId(null);
    }
  }

  function renderComment(c: NoteCommentRow, isReply: boolean) {
    return (
      <div key={c.id} className={["text-xs group", isReply ? "pl-3 border-l-2 border-gray-100" : ""].join(" ")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-navy truncate">{c.author_name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-gray-400 text-[10px] whitespace-nowrap">
              {format(parseISO(c.created_at), "d MMM, h:mm a")}
            </span>
            {isEditor && (
              <button
                type="button"
                onClick={() => handleRemove(c.id)}
                disabled={removingId === c.id}
                title="Delete this note"
                className="leading-none text-gray-300 hover:text-red-600 disabled:opacity-30"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
        {!isReply && (
          <button
            type="button"
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyDraft("");
            }}
            className="text-[10px] text-gray-400 hover:text-navy hover:underline"
          >
            Reply
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-tour={scope === "general" ? "general-notes-panel" : "month-notes-panel"}
      className="bg-white border border-gray-200 rounded-md p-3 flex flex-col gap-2"
    >
      <span className="text-xs font-medium text-gray-500">{title}</span>
      <p className="text-[11px] text-gray-400 -mt-1">{subtitle}</p>

      <div className="flex flex-col gap-2.5">
        {topLevel.length === 0 && <p className="text-xs text-gray-400">No notes yet.</p>}
        {topLevel.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 border-b border-gray-100 pb-2">
            {renderComment(c, false)}
            {(repliesByParent.get(c.id) ?? []).map((reply) => renderComment(reply, true))}
            {replyingTo === c.id && authorName && (
              <div className="pl-3 flex flex-col gap-1">
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder={`Reply to ${c.author_name}…`}
                  rows={2}
                  className="border rounded px-2 py-1 text-xs resize-none"
                />
                <div className="self-end flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="px-2 py-0.5 text-[11px] rounded border border-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReplySubmit(c.id)}
                    disabled={saving || !replyDraft.trim()}
                    className="px-2 py-0.5 text-[11px] rounded bg-navy text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Reply"}
                  </button>
                </div>
              </div>
            )}
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

      {pendingDeleteId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              message="Delete this note?"
              error={deleteError}
              busy={removingId === pendingDeleteId}
              onCancel={() => setPendingDeleteId(null)}
              onConfirm={handleConfirmRemove}
            />
          </div>
        </div>
      )}
    </div>
  );
}
