"use client";

import { useRef, useState, type DragEvent } from "react";
import Button from "./ui/Button";
import { UploadIcon } from "./icons";
import ScheduleImportPreview from "./ScheduleImportPreview";
import type { SchedulePlan } from "@/lib/schedules/planRows";
import { MAX_DOCX_BYTES } from "@/lib/schedules/limits";

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Choose or drop a .docx, read it on the server (nothing is stored), then show the
// preview. The file never leaves memory: the server returns a plan, not a record.
export default function ScheduleImportUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [planKey, setPlanKey] = useState(0);

  function choose(f: File | null | undefined) {
    setError(null);
    setPlan(null);
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setFile(null);
      setError("Only Word (.docx) documents can be read. If yours is .doc, open it in Word and Save As .docx.");
      return;
    }
    if (f.size > MAX_DOCX_BYTES) {
      setFile(null);
      setError("That file is larger than 5 MB. Please upload a smaller Word document.");
      return;
    }
    setFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    choose(e.dataTransfer.files?.[0]);
  }

  async function read() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/schedules/parse", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as (SchedulePlan & { error?: string }) | null;
      if (!res.ok || !json || json.error) {
        setError(json?.error ?? "Something went wrong reading that document. Please try again.");
        return;
      }
      setPlan(json);
      setPlanKey((k) => k + 1);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPlan(null);
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mb-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed p-6 text-center transition-colors duration-fast ${
          dragOver ? "border-navy bg-navy-50" : "border-line-strong bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <p className="text-body text-ink-2">Drop the Word document here, or</p>
        <Button variant="secondary" icon={<UploadIcon className="!h-4 !w-4" />} onClick={() => inputRef.current?.click()}>
          Choose a .docx file
        </Button>
        {file && (
          <p className="text-body text-ink">
            {file.name} <span className="text-ink-3">({sizeText(file.size)})</span>
          </p>
        )}
        <Button onClick={read} disabled={!file} loading={busy}>
          {busy ? "Reading…" : "Read document"}
        </Button>
        {error && (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        )}
      </div>
      {plan && <ScheduleImportPreview key={planKey} plan={plan} onReset={reset} />}
    </div>
  );
}
