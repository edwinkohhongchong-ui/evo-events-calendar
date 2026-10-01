"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HolidayDiffRow, HolidayType } from "@/lib/types";
import { HOLIDAY_TYPES } from "@/lib/constants";
import { createHoliday } from "@/lib/holidayActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { AffectedRow } from "@/lib/undo/types";
import { unwrap } from "@/lib/actionResult";
import { todayDate } from "@/lib/dates";
import { INPUT, LABEL } from "@/components/ui/fieldStyles";
import Button from "@/components/ui/Button";
import { TABLE_CARD, TABLE, TH, TD } from "@/components/ui/tableStyles";
import { ChevronLeftIcon } from "@/components/icons";

const CELL_INPUT = `${INPUT} !min-h-[32px] !w-auto !px-2 !text-body`;
const NOTE = "mt-0.5 text-micro text-amber-700";

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
  return (
    <Suspense fallback={null}>
      <NewYearPageInner />
    </Suspense>
  );
}

function NewYearPageInner() {
  const router = useRouter();
  const { record } = useUndo();
  const searchParams = useSearchParams();
  const nextYear = todayDate().getFullYear() + 1;
  // ?year= comes from the Holidays page's "Update Calendar" button (checks
  // the current year); typing a URL directly, or the default, checks next
  // year instead — same underlying fetch-and-review flow either way.
  const [year, setYear] = useState(Number(searchParams.get("year")) || nextYear);
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
    const affected: AffectedRow[] = [];

    for (const row of approved) {
      try {
        affected.push(
          ...(unwrap(await createHoliday({
            holiday_date: row.editedDate,
            name: row.editedName.trim(),
            type: row.editedType,
          })))
        );
        insertedCount++;
      } catch (err) {
        failed.push({
          name: row.editedName,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    if (affected.length > 0) record(`Import ${insertedCount} holiday(s) for ${phase.year}`, affected);
    setPhase({ kind: "saved", insertedCount, failed });
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <Link href="/holidays" className="inline-flex items-center gap-1 text-body font-medium text-navy hover:underline">
        <ChevronLeftIcon className="!h-4 !w-4" />
        Holidays
      </Link>
      <h1 className="text-xl font-semibold text-navy mt-2 mb-4">Start a New Year</h1>

      {phase.kind === "form" && (
        <div className="flex max-w-sm flex-col gap-4 rounded-card bg-surface p-5">
          <p className="text-body text-ink-2">
            Fetches Singapore public holidays from Calendarific for review. Nothing is written to
            your calendar until you approve it below.
          </p>
          <label className={`flex flex-col gap-1 ${LABEL}`}>
            Year
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={INPUT}
            />
          </label>
          <Button onClick={handleFetch} className="self-start">
            Fetch Holidays
          </Button>
        </div>
      )}

      {phase.kind === "loading" && <div role="status" className="animate-pulse rounded-card bg-surface p-5">
          <div className="h-4 w-40 rounded-chip bg-fill" />
          <span className="sr-only">Fetching…</span>
        </div>}

      {phase.kind === "error" && (
        <div role="alert" className="max-w-xl rounded-card bg-danger/10 p-5 text-body text-ink">
          <p className="mb-1 text-ui font-medium text-danger">Couldn&apos;t fetch holidays</p>
          <p>{phase.message}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setPhase({ kind: "form" })}>
            Try again
          </Button>
        </div>
      )}

      {phase.kind === "results" && phase.totalFromApi === 0 && (
        <div className="max-w-xl rounded-card bg-warn/10 p-5 text-body text-ink">
          <p className="mb-1 text-ui font-medium">
            Calendarific returned 0 holidays for SG/{phase.year}
          </p>
          <p>
            That&apos;s unusual — double check the year, or that your API key/plan supports this
            year, rather than assume there genuinely are none.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setPhase({ kind: "form" })}>
            Back
          </Button>
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
                    "mb-2 text-ui font-semibold",
                    bucket === "collision" ? "text-amber-700" : "text-navy",
                  ].join(" ")}
                >
                  {BUCKET_LABELS[bucket]} ({rows.length})
                </h2>
                <div className={TABLE_CARD}>
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th className={`${TH} w-10`}>
                          <span className="sr-only">Approve</span>
                        </th>
                        <th className={TH}>Date</th>
                        <th className={TH}>Name</th>
                        <th className={TH}>Type</th>
                        <th className={TH}>Calendarific says</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-line align-top first:border-t-0">
                          <td className={TD}>
                            <input
                              type="checkbox"
                              aria-label={`Approve ${row.editedName}`}
                              className="mt-1.5 h-4 w-4 accent-navy"
                              checked={row.approved}
                              onChange={(e) => updateRow(row.id, { approved: e.target.checked })}
                            />
                          </td>
                          <td className={TD}>
                            <input
                              type="date"
                              value={row.editedDate}
                              onChange={(e) => updateRow(row.id, { editedDate: e.target.value })}
                              className={CELL_INPUT}
                            />
                          </td>
                          <td className={TD}>
                            <input
                              value={row.editedName}
                              onChange={(e) => updateRow(row.id, { editedName: e.target.value })}
                              className={`${CELL_INPUT} !w-52`}
                            />
                            {row.isTentative && (
                              <div className={NOTE}>
                                ⚠ Verify date — may be subject to confirmation
                              </div>
                            )}
                            {row.bucket === "collision" && (
                              <div className={NOTE}>
                                Existing entry on this date: &ldquo;{row.existingName}&rdquo;
                              </div>
                            )}
                          </td>
                          <td className={TD}>
                            <select
                              value={row.editedType}
                              onChange={(e) =>
                                updateRow(row.id, { editedType: e.target.value as HolidayType })
                              }
                              className={CELL_INPUT}
                            >
                              {HOLIDAY_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${TD} max-w-[220px] whitespace-normal text-micro text-ink-2`}>
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
            <Button onClick={handleSave}>
              Save Approved ({phase.rows.filter((r) => r.approved).length})
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "saved" && (
        <div className="max-w-xl rounded-card bg-surface p-5 text-body">
          <p className="mb-1 text-ui font-medium">
            Inserted {phase.insertedCount} holiday{phase.insertedCount === 1 ? "" : "s"}.
          </p>
          {phase.failed.length > 0 && (
            <div className="mt-2 text-danger">
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
          <Button size="sm" className="mt-4" onClick={() => router.push("/holidays")}>
            Back to Holidays
          </Button>
        </div>
      )}
    </main>
  );
}
