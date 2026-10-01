"use client";

import { SourceGroup } from "@/lib/examScheduleSources";
import { computeGroupAggregate } from "@/lib/seasonSourceDateAggregate";
import { formatDateDisplay } from "@/lib/dates";

export interface InstitutionValue {
  start_date: string | null;
  end_date: string | null;
}

interface ExamSourceGroupEditorProps {
  group: SourceGroup;
  values: Record<string, InstitutionValue>; // keyed by institution name
  onChange: (institution: string, field: "start_date" | "end_date", value: string) => void;
  // Per-institution flag note shown under its row — e.g. "No prior-year data
  // for this institution — please fill in" on the Start a New Year review.
  flags?: Record<string, string>;
}

// One group's ("Polytechnic Exams", etc.) institution inputs + a live-
// computed proposed aggregate (earliest filled-in start, latest filled-in
// end, and a "N of M filled in" count) — shared between the Update Calendar
// and Start a New Year flows so the math and look stay identical.
export default function ExamSourceGroupEditor({
  group,
  values,
  onChange,
  flags,
}: ExamSourceGroupEditorProps) {
  const entries = group.institutions.map((inst) => values[inst.name] ?? { start_date: null, end_date: null });
  const aggregate = computeGroupAggregate(entries);

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h2 className="text-sm font-semibold text-navy mb-3">{group.groupName}</h2>
      <div className="flex flex-col gap-3">
        {group.institutions.map((inst) => {
          const value = values[inst.name] ?? { start_date: null, end_date: null };
          const flag = flags?.[inst.name];
          return (
            <div
              key={inst.name}
              className="flex flex-col sm:flex-row sm:items-center gap-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
            >
              <div className="sm:w-56 shrink-0">
                <a
                  href={inst.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-navy hover:underline"
                >
                  {inst.name}
                </a>
                {flag && <div className="text-[11px] text-amber-700 mt-0.5">{flag}</div>}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  Start
                  <input
                    type="date"
                    value={value.start_date ?? ""}
                    onChange={(e) => onChange(inst.name, "start_date", e.target.value)}
                    className="border rounded px-1.5 py-0.5 text-sm"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  End
                  <input
                    type="date"
                    value={value.end_date ?? ""}
                    onChange={(e) => onChange(inst.name, "end_date", e.target.value)}
                    className="border rounded px-1.5 py-0.5 text-sm"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 flex flex-wrap items-center justify-between gap-2">
        <span>
          {aggregate.filledCount} of {aggregate.total} filled in
        </span>
        <span className="text-navy font-medium">
          Proposed:{" "}
          {aggregate.startDate ? formatDateDisplay(aggregate.startDate) : "—"} to{" "}
          {aggregate.endDate ? formatDateDisplay(aggregate.endDate) : "—"}
        </span>
      </div>
    </div>
  );
}
