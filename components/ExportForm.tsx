"use client";

import { useState } from "react";
import { toDateStr } from "@/lib/dates";
import { LevelRow } from "@/lib/types";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export default function ExportForm({ levels }: { levels: LevelRow[] }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(toDateStr(startOfMonth(now)));
  const [endDate, setEndDate] = useState(toDateStr(endOfMonth(now)));
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    () => new Set(levels.map((l) => l.name))
  );
  const [generating, setGenerating] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleLevel(name: string) {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleExport(format: "pdf" | "docx") {
    if (!startDate || !endDate) {
      setError("Pick a start and end date.");
      return;
    }
    if (endDate < startDate) {
      setError("End date can't be before start date.");
      return;
    }
    if (selectedLevels.size === 0) {
      setError("Select at least one category.");
      return;
    }

    setError(null);
    setGenerating(format);
    try {
      const res = await fetch("/api/export/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          startDate,
          endDate,
          levels: selectedLevels.size === levels.length ? [] : Array.from(selectedLevels),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong generating the document.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evo-event-lineup.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong generating the document.");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        Categories
        <div className="flex flex-wrap gap-3">
          {levels.map((level) => (
            <label key={level.id} className="flex items-center gap-1.5 text-sm font-normal">
              <input
                type="checkbox"
                checked={selectedLevels.has(level.name)}
                onChange={() => toggleLevel(level.name)}
              />
              {level.name}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleExport("pdf")}
          disabled={generating !== null}
          className="px-3 py-1.5 text-sm rounded bg-navy text-white disabled:opacity-50"
        >
          {generating === "pdf" ? "Generating…" : "Export as PDF"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("docx")}
          disabled={generating !== null}
          className="px-3 py-1.5 text-sm rounded border border-navy text-navy disabled:opacity-50"
        >
          {generating === "docx" ? "Generating…" : "Export as Word"}
        </button>
      </div>
    </div>
  );
}
