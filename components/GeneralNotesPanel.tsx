"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateGeneralNotes } from "@/lib/generalNotesActions";
import { useAutoGrowTextarea } from "@/lib/useAutoGrowTextarea";
import { GeneralNotesRow } from "@/lib/types";

// Persists across every month — unlike MonthNotesPanel, this isn't keyed by
// year/month, so it never remounts when navigating between months.
export default function GeneralNotesPanel({ generalNotes }: { generalNotes: GeneralNotesRow }) {
  const router = useRouter();
  const [content, setContent] = useState(generalNotes.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(generalNotes.content ?? "");
  const textareaRef = useAutoGrowTextarea(content);

  async function handleBlur() {
    if (savedRef.current === content) return;
    setSaving(true);
    setError(null);
    try {
      await updateGeneralNotes(content.trim() || null);
      savedRef.current = content;
      setSaving(false);
      router.refresh();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Something went wrong saving this.");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">General Notes</span>
      <p className="text-[11px] text-gray-400 -mt-1">Shown for every month.</p>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleBlur}
        className="border rounded px-2 py-1.5 text-sm min-h-[200px] resize-none overflow-hidden"
        placeholder="Notes that apply regardless of month…"
      />
      {saving && <p className="text-xs text-gray-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
