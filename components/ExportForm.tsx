"use client";

import { useState } from "react";
import { todayDate, toDateStr } from "@/lib/dates";
import { LevelRow } from "@/lib/types";
import { dotStyle } from "@/lib/colorStyle";
import { resolveLevelColor } from "@/lib/levelColor";
import Button from "./ui/Button";
import Card from "./ui/Card";
import { INPUT, LABEL } from "./ui/fieldStyles";
import { DownloadIcon, FileTextIcon, CheckIcon } from "./icons";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

type Preset = "this" | "next" | "three" | "custom";
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "this", label: "This month" },
  { id: "next", label: "Next month" },
  { id: "three", label: "Next 3 months" },
  { id: "custom", label: "Custom" },
];

function rangeFor(preset: Exclude<Preset, "custom">, now: Date): [string, string] {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "this") return [toDateStr(startOfMonth(now)), toDateStr(endOfMonth(now))];
  if (preset === "next") {
    const d = new Date(y, m + 1, 1);
    return [toDateStr(startOfMonth(d)), toDateStr(endOfMonth(d))];
  }
  return [toDateStr(startOfMonth(now)), toDateStr(endOfMonth(new Date(y, m + 2, 1)))];
}

const FORMATS: Array<{ id: "pdf" | "docx"; title: string; blurb: string }> = [
  { id: "pdf", title: "PDF", blurb: "Easy to print or share" },
  { id: "docx", title: "Word", blurb: "Editable in Word or Pages" },
];

export default function ExportForm({ levels }: { levels: LevelRow[] }) {
  const now = todayDate();
  const [preset, setPreset] = useState<Preset>("this");
  const [startDate, setStartDate] = useState(toDateStr(startOfMonth(now)));
  const [endDate, setEndDate] = useState(toDateStr(endOfMonth(now)));
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    () => new Set(levels.map((l) => l.name))
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickPreset(id: Preset) {
    setPreset(id);
    if (id !== "custom") {
      const [s, e] = rangeFor(id, todayDate());
      setStartDate(s);
      setEndDate(e);
    }
  }

  function toggleLevel(name: string) {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleExport() {
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
    setGenerating(true);
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
      setGenerating(false);
    }
  }

  const allSelected = selectedLevels.size === levels.length;
  const canDownload = !!startDate && !!endDate && selectedLevels.size > 0;

  return (
    <Card padding="p-5" className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className={LABEL}>Format</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => {
            const active = format === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormat(f.id)}
                className={[
                  "flex items-start gap-3 rounded-card border p-4 text-left transition-colors duration-fast",
                  active ? "border-navy bg-navy-50 ring-1 ring-navy" : "border-line-strong hover:bg-canvas",
                ].join(" ")}
              >
                <span className={active ? "text-navy" : "text-ink-2"}>
                  <FileTextIcon />
                </span>
                <span className="flex-1">
                  <span className="block text-ui font-semibold text-ink">{f.title}</span>
                  <span className="block text-body text-ink-2">{f.blurb}</span>
                </span>
                {active && (
                  <span className="text-navy">
                    <CheckIcon className="!h-4 !w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={LABEL}>Dates</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => pickPreset(p.id)}
              className={[
                "min-h-[32px] coarse:min-h-[44px] rounded-pill px-3.5 text-body font-medium transition-colors duration-fast",
                preset === p.id ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>End date</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={INPUT} />
            </label>
          </div>
        ) : (
          <p className="text-body text-ink-2">
            {startDate} to {endDate}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className={LABEL}>Categories</h2>
          <button
            type="button"
            onClick={() => setSelectedLevels(allSelected ? new Set() : new Set(levels.map((l) => l.name)))}
            className="text-body font-medium text-navy hover:underline"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map((level) => {
            const on = selectedLevels.has(level.name);
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLevel(level.name)}
                className={[
                  "inline-flex min-h-[32px] coarse:min-h-[44px] items-center gap-1.5 rounded-pill border px-3 text-body font-medium transition-colors duration-fast",
                  on ? "border-navy bg-navy-50 text-ink" : "border-line-strong bg-white text-ink-3 hover:bg-canvas",
                ].join(" ")}
              >
                <span
                  className={`h-2 w-2 rounded-full ${on ? dotStyle(resolveLevelColor(level)).className : "bg-line-strong"}`}
                  style={on ? dotStyle(resolveLevelColor(level)).style : undefined}
                  aria-hidden="true"
                />
                {level.name}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-body text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleExport}
          loading={generating}
          disabled={!canDownload}
          icon={<DownloadIcon className="!h-4 !w-4" />}
        >
          {generating ? "Generating…" : `Download ${format === "pdf" ? "PDF" : "Word file"}`}
        </Button>
      </div>
    </Card>
  );
}
