"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HolidayDiffRow, HolidayType } from "@/lib/types";
import { HOLIDAY_TYPES } from "@/lib/constants";
import { createHoliday } from "@/lib/holidayActions";

interface ReviewRow extends HolidayDiffRow {
  id: string;
  approved: boolean;
  editedName: string;
  editedDate: string;
  editedType: HolidayType;
}

type Phase =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "results"; year: number; totalFromApi: number; rows: ReviewRow[] }
  | { kind: "saved"; insertedCount: number; failed: { name: string; error: string }[] };

const BUCKET_LABELS: Record<HolidayDiffRow["bucket"], string> = {
  new: "New",
  existing: "Already in your calendar",
  collision: "Possible conflict — same date, different name",
};

const BUCKET_ORDER: HolidayDiffRow["bucket"][] = ["new", "collision", "existing"];

function toReviewRow(row: HolidayDiffRow, index: number): ReviewRow {
  return {
    ...row,
    id: `${row.date}::${index}`,
    approved: row.bucket === "new",
    editedName: row.name,
    editedDate: row.date,
    editedType: row.suggestedType,
  };
}

export default function NewYearPage() {
  const router = useRouter();
  const nextYear = new Date().getFullYear() + 1;
  const [year, setYear] = useState(nextYear);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  async function handleFetch() {
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/holidays/fetch-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPhase({ kind: "error", message: data.error ?? "Something went wrong." });
        return;
      }
      setPhase({
        kind: "results",
        year: data.year,
        totalFromApi: data.totalFromApi,
        rows: (data.rows as HolidayDiffRow[]).map(toReviewRow),
      });
    } catch {
      setPhase({ kind: "error", message: "Couldn't reach the server. Please try again." });
    }
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    if (phase.kind !== "results") return;
    setPhase({
      ...phase,
      rows: phase.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  async function handleSave() {
    if (phase.kind !== "results") return;
    const approved = phase.rows.filter((r) => r.approved);
    let insertedCount = 0;
    const failed: { name: string; error: string }[] = [];

    for (const row of approved) {
      try {
        await createHoliday({
          holiday_date: row.editedDate,
          name: row.editedName.trim(),
          type: row.editedType,
        });
        insertedCount++;
      } catch (err) {
        failed.push({
          name: row.editedName,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setPhase({ kind: "saved", insertedCount, failed });
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <Link href="/holidays" className="text-sm text-navy hover:underline">
        ← Holidays
      </Link>
      <h1 className="text-xl font-semibold text-navy mt-2 mb-4">Start a New Year</h1>

      {phase.kind === "form" && (
        <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col gap-3 max-w-sm">
          <p className="text-sm text-gray-600">
            Fetches Singapore public holidays from Calendarific for review. Nothing is written to
            your calendar until you approve it below.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Year
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-2 py-1"
            />
          </label>
          <button
            onClick={handleFetch}
            className="px-3 py-1.5 text-sm rounded bg-navy text-white self-start"
          >
            Fetch Holidays
          </button>
        </div>
      )}

      {phase.kind === "loading" && <p className="text-sm text-gray-500">Fetching…</p>}

      {phase.kind === "error" && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 text-sm">
          <p className="font-medium mb-1">Couldn&apos;t fetch holidays</p>
          <p>{phase.message}</p>
          <button
            onClick={() => setPhase({ kind: "form" })}
            className="mt-3 px-3 py-1.5 text-sm rounded border border-red-300 text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {phase.kind === "results" && phase.totalFromApi === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-4 text-sm">
          <p className="font-medium mb-1">
            Calendarific returned 0 holidays for SG/{phase.year}
          </p>
          <p>
            That&apos;s unusual — double check the year, or that your API key/plan supports this
            year, rather than assume there genuinely are none.
          </p>
          <button
            onClick={() => setPhase({ kind: "form" })}
            className="mt-3 px-3 py-1.5 text-sm rounded border border-amber-300 text-amber-800"
          >
            Back
          </button>
        </div>
      )}

      {phase.kind === "results" && phase.totalFromApi > 0 && (
        <div className="flex flex-col gap-6">
          {BUCKET_ORDER.map((bucket) => {
            const rows = phase.rows.filter((r) => r.bucket === bucket);
            if (rows.length === 0) return null;
            return (
              <div key={bucket}>
                <h2
                  className={[
                    "text-sm font-semibold mb-2",
                    bucket === "collision" ? "text-amber-700" : "text-navy",
                  ].join(" ")}
                >
                  {BUCKET_LABELS[bucket]} ({rows.length})
                </h2>
                <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 text-left">
                      <tr>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Calendarific says</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-gray-200 align-top">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={row.approved}
                              onChange={(e) => updateRow(row.id, { approved: e.target.checked })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={row.editedDate}
                              onChange={(e) => updateRow(row.id, { editedDate: e.target.value })}
                              className="border rounded px-1.5 py-0.5 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.editedName}
                              onChange={(e) => updateRow(row.id, { editedName: e.target.value })}
                              className="border rounded px-1.5 py-0.5 text-sm w-48"
                            />
                            {row.isTentative && (
                              <div className="text-[11px] text-amber-700 mt-0.5">
                                ⚠ Verify date — may be subject to confirmation
                              </div>
                            )}
                            {row.bucket === "collision" && (
                              <div className="text-[11px] text-amber-700 mt-0.5">
                                Existing entry on this date: &ldquo;{row.existingName}&rdquo;
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.editedType}
                              onChange={(e) =>
                                updateRow(row.id, { editedType: e.target.value as HolidayType })
                              }
                              className="border rounded px-1.5 py-0.5 text-sm"
                            >
                              {HOLIDAY_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 max-w-[220px] whitespace-normal text-gray-500 text-[11px]">
                            <div>{row.rawType.join(", ")}</div>
                            {row.description && <div className="mt-0.5">{row.description}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded bg-navy text-white"
            >
              Save Approved ({phase.rows.filter((r) => r.approved).length})
            </button>
          </div>
        </div>
      )}

      {phase.kind === "saved" && (
        <div className="bg-white border border-gray-200 rounded-md p-4 text-sm">
          <p className="font-medium mb-1">
            Inserted {phase.insertedCount} holiday{phase.insertedCount === 1 ? "" : "s"}.
          </p>
          {phase.failed.length > 0 && (
            <div className="text-red-600 mt-2">
              <p className="font-medium">{phase.failed.length} failed:</p>
              <ul className="list-disc list-inside">
                {phase.failed.map((f, i) => (
                  <li key={i}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={() => router.push("/holidays")}
            className="mt-3 px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            Back to Holidays
          </button>
        </div>
      )}
    </main>
  );
}
