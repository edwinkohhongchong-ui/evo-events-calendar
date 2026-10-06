"use client";

import NotesPanel from "./NotesPanel";
import { NotebookPenIcon, XIcon } from "./icons";
import { NoteCommentRow } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comments: NoteCommentRow[];
}

// Top-bar notes button + slide-over drawer, so the overall General Notes stay
// one click away on every page except the Calendar (which has its own card).
// Reuses NotesPanel, so add / reply / delete and the Editor/Viewer rules
// behave exactly as they do on the Calendar.
export default function GeneralNotesDrawer({ open, onOpenChange, comments }: Props) {
  return (
    <div className="shrink-0" data-tour="general-notes-button">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="General Notes"
        title="General Notes"
        className="relative flex h-8 w-8 coarse:h-11 coarse:w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-gold transition-colors duration-fast"
      >
        <NotebookPenIcon className="!h-[18px] !w-[18px]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => onOpenChange(false)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-label="General Notes"
            className="fixed right-0 top-0 z-50 flex h-full w-[min(24rem,100vw)] flex-col bg-canvas text-ink shadow-pop"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-micro text-ink-2">Visible on every page</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close General Notes"
                className="inline-flex h-7 w-7 coarse:h-11 coarse:w-11 items-center justify-center rounded-full text-ink-2 hover:bg-fill hover:text-ink"
              >
                <XIcon className="!h-4 !w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <NotesPanel
                title="General Notes"
                subtitle="Every month"
                placeholder="Add a note…"
                scope="general"
                comments={comments}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
