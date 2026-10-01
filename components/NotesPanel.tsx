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
import Card from "./ui/Card";
import Button from "./ui/Button";
import AutoGrowTextarea from "./ui/AutoGrowTextarea";
import { XIcon } from "./icons";
import { unwrap } from "@/lib/actionResult";

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
      const affected = unwrap(await createNoteComment({
        scope,
        year: year ?? null,
        month: month ?? null,
        author_name: authorName,
        content: content.trim(),
      }));
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
      const affected = unwrap(await createNoteComment({
        scope,
        year: year ?? null,
        month: month ?? null,
        author_name: authorName,
        content: replyDraft.trim(),
        parent_id: parentId,
      }));
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
      const affected = unwrap(await deleteNoteComment(id));
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
      <div key={c.id} className={["group", isReply ? "pl-3 border-l-2 border-line" : ""].join(" ")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-chip font-medium text-navy truncate">{c.author_name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-micro text-ink-2 whitespace-nowrap">
              {format(parseISO(c.created_at), "d MMM, h:mm a")}
            </span>
            {isEditor && (
              <button
                type="button"
                onClick={() => handleRemove(c.id)}
                disabled={removingId === c.id}
                title="Delete this note"
                aria-label="Delete this note"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-danger disabled:opacity-30"
              >
                <XIcon className="!h-3.5 !w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-chip text-ink whitespace-pre-wrap break-words">{c.content}</p>
        {!isReply && (
          <button
            type="button"
            onClick={() => {
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyDraft("");
            }}
            className="text-micro font-medium text-ink-2 hover:text-navy hover:underline"
          >
            Reply
          </button>
        )}
      </div>
    );
  }

  return (
    <Card
      data-notes-panel={scope}
      data-tour={scope === "general" ? "general-notes-panel" : "month-notes-panel"}
      padding="p-4"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-ui font-semibold text-ink">{title}</h2>
        <span className="text-micro text-ink-2 whitespace-nowrap">{subtitle}</span>
      </div>

      <div className="flex flex-col gap-3">
        {topLevel.length === 0 && <p className="text-chip text-ink-2">No notes yet.</p>}
        {topLevel.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0 last:pb-0">
            {renderComment(c, false)}
            {(repliesByParent.get(c.id) ?? []).map((reply) => renderComment(reply, true))}
            {replyingTo === c.id && authorName && (
              <div className="pl-3 flex flex-col gap-1">
                <AutoGrowTextarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder={`Reply to ${c.author_name}…`}
                  rows={2}
                  className="border border-line-strong rounded-ctl px-2.5 py-1.5 text-chip resize-none"
                />
                <div className="self-end flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleReplySubmit(c.id)}
                    disabled={saving || !replyDraft.trim()}
                  >
                    {saving ? "Saving…" : "Reply"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        {authorName ? (
          <div className="flex items-center gap-1 text-micro text-ink-2">
            Commenting as <span className="font-medium text-ink">{authorName}</span>
            <button
              type="button"
              onClick={() => setAuthorNameState(null)}
              className="underline hover:no-underline hover:text-navy"
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
              className="border border-line-strong rounded-pill px-3 py-1 text-chip flex-1 min-w-0"
            />
            <Button size="sm" onClick={() => saveAuthorName(nameDraft)} disabled={!nameDraft.trim()}>
              Set
            </Button>
          </div>
        )}

        {authorName && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
            <AutoGrowTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="border border-line-strong rounded-ctl px-2.5 py-1.5 text-body resize-none"
            />
            <Button type="submit" size="sm" className="self-end" disabled={saving || !content.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </div>
      {error && <p className="text-micro text-danger">{error}</p>}

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
    </Card>
  );
}
