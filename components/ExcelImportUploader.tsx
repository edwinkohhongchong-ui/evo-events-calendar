"use client";

import { useRef, useState, type DragEvent } from "react";
import Button from "./ui/Button";
import { UploadIcon } from "./icons";
import ExcelImportPreview from "./ExcelImportPreview";
import type { ExcelParseResponse } from "@/lib/excelImport/responseTypes";
import { MAX_XLSX_BYTES } from "@/lib/excelImport/limits";

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Choose or drop a .xlsx, read it on the server (nothing is stored), then show the
// preview. The file never leaves memory: the server returns a plan, not a record.
export default function ExcelImportUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ExcelParseResponse | null>(null);
  const [resultKey, setResultKey] = useState(0);

  function choose(f: File | null | undefined) {
    setError(null);
    setResult(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setFile(null);
      setError("Only Excel (.xlsx) workbooks can be read. If yours is .xls, open it in Excel and Save As .xlsx.");
      return;
    }
    if (f.size > MAX_XLSX_BYTES) {
      setFile(null);
      setError("That file is larger than 5 MB. Please upload a smaller Excel workbook.");
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
      const res = await fetch("/api/excel/parse", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as (Partial<ExcelParseResponse> & { error?: string }) | null;
      if (!res.ok || !json || json.error || !json.plan) {
        setError(json?.error ?? "Something went wrong reading that workbook. Please try again.");
        return;
      }
      setResult(json as ExcelParseResponse);
      setResultKey((k) => k + 1);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
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
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <p className="text-body text-ink-2">Drop the events calendar workbook here, or</p>
        <Button variant="secondary" icon={<UploadIcon className="!h-4 !w-4" />} onClick={() => inputRef.current?.click()}>
          Choose a .xlsx file
        </Button>
        {file && (
          <p className="text-body text-ink">
            {file.name} <span className="text-ink-3">({sizeText(file.size)})</span>
          </p>
        )}
        <Button onClick={read} disabled={!file} loading={busy}>
          {busy ? "Reading…" : "Read workbook"}
        </Button>
        {error && (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        )}
      </div>
      {result && <ExcelImportPreview key={resultKey} result={result} onReset={reset} />}
    </div>
  );
}
