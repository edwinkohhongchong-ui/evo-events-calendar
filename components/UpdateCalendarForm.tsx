"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EXAM_SCHEDULE_SOURCES } from "@/lib/examScheduleSources";
import { SeasonRow, SeasonSourceDateRow } from "@/lib/types";
import { computeGroupAggregate } from "@/lib/seasonSourceDateAggregate";
import { createSeason, updateSeason } from "@/lib/seasonActions";
import { saveSeasonSourceDates, SeasonSourceDateEntry } from "@/lib/seasonSourceDateActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { AffectedRow } from "@/lib/undo/types";
import ExamSourceGroupEditor, { InstitutionValue } from "./ExamSourceGroupEditor";

type ValuesByGroup = Record<string, Record<string, InstitutionValue>>;

interface SavedSummaryLine {
  groupName: string;
  institutionsFilled: number;
  institutionsTotal: number;
  season: "created" | "updated" | "skipped" | "error";
  error?: string;
}

type Phase =
  | { kind: "form" }
  | { kind: "saving" }
  | { kind: "saved"; lines: SavedSummaryLine[] };

function buildInitialValues(initialSourceDates: SeasonSourceDateRow[]): ValuesByGroup {
  const byGroupAndInstitution: ValuesByGroup = {};
  for (const group of EXAM_SCHEDULE_SOURCES) {
    byGroupAndInstitution[group.groupName] = {};
    for (const inst of group.institutions) {
      const existing = initialSourceDates.find(
        (r) => r.group_name === group.groupName && r.institution === inst.name
      );
      byGroupAndInstitution[group.groupName][inst.name] = {
        start_date: existing?.start_date ?? null,
        end_date: existing?.end_date ?? null,
      };
    }
  }
  return byGroupAndInstitution;
}

export default function UpdateCalendarForm({
  year,
  seasons,
  initialSourceDates,
}: {
  year: number;
  seasons: SeasonRow[];
  initialSourceDates: SeasonSourceDateRow[];
}) {
  const router = useRouter();
  const { record } = useUndo();
  const [values, setValues] = useState<ValuesByGroup>(() => buildInitialValues(initialSourceDates));
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  function handleChange(groupName: string, institution: string, field: "start_date" | "end_date", value: string) {
    setValues((prev) => ({
      ...prev,
      [groupName]: {
        ...prev[groupName],
        [institution]: {
          ...prev[groupName][institution],
          [field]: value || null,
        },
      },
    }));
  }

  async function handleSave() {
    setPhase({ kind: "saving" });
    const affected: AffectedRow[] = [];
    const lines: SavedSummaryLine[] = [];

    // Each group is saved independently — one group's failure (e.g. a save
    // error) must not lose groups already successfully saved earlier in this
    // same loop, nor block groups still to come. Mirrors the Holidays
    // new-year review's per-row success/failure reporting.
    for (const group of EXAM_SCHEDULE_SOURCES) {
      const groupValues = values[group.groupName];
      const entries: SeasonSourceDateEntry[] = group.institutions.map((inst) => ({
        group_name: group.groupName,
        institution: inst.name,
        start_date: groupValues[inst.name].start_date,
        end_date: groupValues[inst.name].end_date,
      }));
      const filled = entries.filter((e) => e.start_date || e.end_date);
      const aggregate = computeGroupAggregate(entries);

      try {
        if (filled.length > 0) {
          await saveSeasonSourceDates(year, filled);
        }

        const seasonName = `${group.groupName} ${year}`;
        const existingSeason = seasons.find(
          (s) => s.name === seasonName && s.category === group.category
        );

        if (!aggregate.startDate || !aggregate.endDate) {
          lines.push({
            groupName: group.groupName,
            institutionsFilled: aggregate.filledCount,
            institutionsTotal: aggregate.total,
            season: "skipped",
          });
          continue;
        }

        const seasonValues = {
          name: seasonName,
          category: group.category,
          start_date: aggregate.startDate,
          end_date: aggregate.endDate,
          notes: existingSeason?.notes ?? null,
          color: existingSeason?.color ?? null,
        };

        if (existingSeason) {
          affected.push(...(await updateSeason(existingSeason.id, seasonValues)));
          lines.push({
            groupName: group.groupName,
            institutionsFilled: aggregate.filledCount,
            institutionsTotal: aggregate.total,
            season: "updated",
          });
        } else {
          affected.push(...(await createSeason(seasonValues)));
          lines.push({
            groupName: group.groupName,
            institutionsFilled: aggregate.filledCount,
            institutionsTotal: aggregate.total,
            season: "created",
          });
        }
      } catch (err) {
        lines.push({
          groupName: group.groupName,
          institutionsFilled: aggregate.filledCount,
          institutionsTotal: aggregate.total,
          season: "error",
          error: err instanceof Error ? err.message : "Something went wrong saving this group.",
        });
      }
    }

    if (affected.length > 0) record(`Update Calendar (${year})`, affected);
    setPhase({ kind: "saved", lines });
  }

  const anyFilled = useMemo(
    () =>
      EXAM_SCHEDULE_SOURCES.some((group) =>
        group.institutions.some((inst) => {
          const v = values[group.groupName][inst.name];
          return v.start_date || v.end_date;
        })
      ),
    [values]
  );

  if (phase.kind === "saved") {
    return (
      <div className="bg-white border border-gray-200 rounded-md p-4 text-sm">
        <p className="font-medium mb-2">Calendar updated for {year}.</p>
        <ul className="list-disc list-inside flex flex-col gap-1">
          {phase.lines.map((line) => (
            <li key={line.groupName}>
              {line.groupName}: {line.institutionsFilled} of {line.institutionsTotal} institutions
              filled in —{" "}
              {line.season === "created" && "season created"}
              {line.season === "updated" && "season updated"}
              {line.season === "skipped" && (
                <span className="text-amber-700">
                  no season saved (need at least one start and one end date)
                </span>
              )}
              {line.season === "error" && (
                <span className="text-red-600">failed to save — {line.error}</span>
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={() => router.push("/seasons")}
          className="mt-3 px-3 py-1.5 text-sm rounded bg-navy text-white"
        >
          Back to Seasons
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {EXAM_SCHEDULE_SOURCES.map((group) => (
        <ExamSourceGroupEditor
          key={group.groupName}
          group={group}
          values={values[group.groupName]}
          onChange={(institution, field, value) => handleChange(group.groupName, institution, field, value)}
        />
      ))}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={phase.kind === "saving" || !anyFilled}
          className="px-4 py-2 text-sm rounded bg-navy text-white disabled:opacity-50"
        >
          {phase.kind === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
