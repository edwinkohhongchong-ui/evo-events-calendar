"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertMonthFocus } from "@/lib/monthFocusActions";
import { MonthFocusRow, MonthFocusValues } from "@/lib/types";

interface FocusPanelProps {
  year: number;
  month: number;
  monthFocus: MonthFocusRow | null;
}

// "notes" isn't owned here anymore — see MonthNotesPanel (PROJECT decision:
// moved to the right-hand notes column, not duplicated). Writes still
// include the current notes value from the monthFocus prop so they don't
// clobber it.
type Field = "series_focus" | "key_theme";

function normalize(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function FocusPanel({ year, month, monthFocus }: FocusPanelProps) {
  const router = useRouter();
  const [seriesFocus, setSeriesFocus] = useState(monthFocus?.series_focus ?? "");
  const [keyTheme, setKeyTheme] = useState(monthFocus?.key_theme ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedRef = useRef<{ series_focus: string | null; key_theme: string | null }>({
    series_focus: monthFocus?.series_focus ?? null,
    key_theme: monthFocus?.key_theme ?? null,
  });

  async function saveIfChanged(field: Field, rawValue: string) {
    const normalized = normalize(rawValue);
    if (savedRef.current[field] === normalized) return;

    setSaving(true);
    setError(null);

    const values: MonthFocusValues = {
      series_focus: field === "series_focus" ? normalized : normalize(seriesFocus),
      key_theme: field === "key_theme" ? normalized : normalize(keyTheme),
      notes: monthFocus?.notes ?? null,
    };

    try {
      await upsertMonthFocus(year, month, values);
      savedRef.current = { ...savedRef.current, [field]: normalized };
      setSaving(false);
      router.refresh();
    } catch (err) {
      setSaving(false);
      // Field values are untouched here — whatever the user typed stays in
      // the input; only the saved-vs-not bookkeeping is unaffected by a
      // failed write, so the next blur will retry.
      setError(err instanceof Error ? err.message : "Something went wrong saving this.");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">Series / Sermon Focus</span>
          <input
            value={seriesFocus}
            onChange={(e) => setSeriesFocus(e.target.value)}
            onBlur={(e) => saveIfChanged("series_focus", e.target.value)}
            className="border rounded px-2 py-1"
            placeholder="—"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-gray-500">Key Theme</span>
          <input
            value={keyTheme}
            onChange={(e) => setKeyTheme(e.target.value)}
            onBlur={(e) => saveIfChanged("key_theme", e.target.value)}
            className="border rounded px-2 py-1"
            placeholder="—"
          />
        </label>
      </div>
      {saving && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
