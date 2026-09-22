"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertMonthFocus } from "@/lib/monthFocusActions";
import { useAutoGrowTextarea } from "@/lib/useAutoGrowTextarea";
import { MonthFocusRow } from "@/lib/types";

interface MonthNotesPanelProps {
  year: number;
  month: number;
  monthFocus: MonthFocusRow | null;
}

// The right-hand, month-specific counterpart to GeneralNotesPanel — this is
// month_focus.notes, the field that used to live in FocusPanel's own row
// (see PROJECT decision: moved here, not duplicated). Writes still go
// through upsertMonthFocus, which replaces the whole row, so series_focus/
// key_theme are always included from the current monthFocus prop even
// though this panel doesn't own them.
export default function MonthNotesPanel({ year, month, monthFocus }: MonthNotesPanelProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(monthFocus?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(monthFocus?.notes ?? "");
  const textareaRef = useAutoGrowTextarea(notes);

  async function handleBlur() {
    const normalized = notes.trim() || null;
    if (savedRef.current === (normalized ?? "")) return;
    setSaving(true);
    setError(null);
    try {
      await upsertMonthFocus(year, month, {
        series_focus: monthFocus?.series_focus ?? null,
        key_theme: monthFocus?.key_theme ?? null,
        notes: normalized,
      });
      savedRef.current = normalized ?? "";
      setSaving(false);
      router.refresh();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Something went wrong saving this.");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">Month Notes</span>
      <p className="text-[11px] text-gray-400 -mt-1">Specific to this month only.</p>
      <textarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        className="border rounded px-2 py-1.5 text-sm min-h-[200px] resize-none overflow-hidden"
        placeholder="Notes for this month…"
      />
      {saving && <p className="text-xs text-gray-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
