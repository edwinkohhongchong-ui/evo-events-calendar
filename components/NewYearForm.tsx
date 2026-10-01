"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SeasonRow, SeasonSourceDateRow } from "@/lib/types";
import { EXAM_SCHEDULE_SOURCES, SourceGroup } from "@/lib/examScheduleSources";
import { computeGroupAggregate } from "@/lib/seasonSourceDateAggregate";
import { createSeason } from "@/lib/seasonActions";
import { saveSeasonSourceDates, SeasonSourceDateEntry } from "@/lib/seasonSourceDateActions";
import { parseDateStr, toDateStr, formatDateDisplay } from "@/lib/dates";
import { useUndo } from "@/lib/undo/UndoProvider";
import { AffectedRow } from "@/lib/undo/types";
import ExamSourceGroupEditor, { InstitutionValue } from "./ExamSourceGroupEditor";
import { addYears } from "date-fns";
import { unwrap } from "@/lib/actionResult";
import Button from "./ui/Button";
import { INPUT, LABEL } from "./ui/fieldStyles";

const FIELD_INPUT = `${INPUT} !w-auto`;

const TRACKED_CATEGORIES = new Set(["School Schedule", "Exam Period"]);

interface TrackedReviewItem {
  kind: "tracked";
  seasonId: string;
  group: SourceGroup;
  editedName: string;
  values: Record<string, InstitutionValue>;
  flags: Record<string, string>;
}

interface ShiftedReviewItem {
  kind: "shifted";
  seasonId: string;
  category: SeasonRow["category"];
  originalName: string;
  editedName: string;
  editedStart: string;
  editedEnd: string;
  originalNotes: string | null;
}

type ReviewItem = TrackedReviewItem | ShiftedReviewItem;

interface SavedLine {
  name: string;
  outcome: string;
  flag?: string;
}

type Phase =
  | { kind: "form" }
  | { kind: "review"; items: ReviewItem[] }
  | { kind: "saving" }
  | { kind: "saved"; lines: SavedLine[] };

// Best-effort: "RF 2025/2026" -> "RF 2026/2027", "Polytechnic Exams 2026" ->
// "Polytechnic Exams 2027" — bumps every bare 4-digit year in the name by
// `delta`. Always shown as an editable field, never trusted blindly.
function shiftYearsInName(name: string, delta: number): string {
  return name.replace(/\d{4}/g, (match) => String(Number(match) + delta));
}

function matchGroupForSeason(seasonName: string, year: number): SourceGroup | undefined {
  const exact = EXAM_SCHEDULE_SOURCES.find((g) => seasonName === `${g.groupName} ${year}`);
  if (exact) return exact;
  return EXAM_SCHEDULE_SOURCES.find((g) => seasonName.startsWith(g.groupName));
}

function buildTrackedItem(
  season: SeasonRow,
  nextYear: number,
  priorSourceDates: SeasonSourceDateRow[]
): TrackedReviewItem | null {
  const currentYear = Number(season.start_date.slice(0, 4));
  const group =
    matchGroupForSeason(season.name, currentYear) ??
    EXAM_SCHEDULE_SOURCES.find((g) => g.category === season.category);
  if (!group) return null;

  const values: Record<string, InstitutionValue> = {};
  const flags: Record<string, string> = {};
  for (const inst of group.institutions) {
    const prior = priorSourceDates.find(
      (r) => r.group_name === group.groupName && r.institution === inst.name
    );
    if (prior && (prior.start_date || prior.end_date)) {
      values[inst.name] = { start_date: prior.start_date, end_date: prior.end_date };
    } else {
      values[inst.name] = { start_date: null, end_date: null };
      flags[inst.name] = "No prior-year data for this institution — please fill in";
    }
  }

  return {
    kind: "tracked",
    seasonId: season.id,
    group,
    editedName: shiftYearsInName(season.name, nextYear - currentYear),
    values,
    flags,
  };
}

function buildShiftedItem(season: SeasonRow): ShiftedReviewItem {
  const start = parseDateStr(season.start_date);
  const end = parseDateStr(season.end_date);
  return {
    kind: "shifted",
    seasonId: season.id,
    category: season.category,
    originalName: season.name,
    editedName: shiftYearsInName(season.name, 1),
    editedStart: toDateStr(addYears(start, 1)),
    editedEnd: toDateStr(addYears(end, 1)),
    originalNotes: season.notes,
  };
}

export default function NewYearForm({
  currentYear,
  nextYear,
  currentYearSeasons,
  allSeasons,
  priorSourceDates,
}: {
  currentYear: number;
  nextYear: number;
  currentYearSeasons: SeasonRow[];
  allSeasons: SeasonRow[];
  priorSourceDates: SeasonSourceDateRow[];
}) {
  const router = useRouter();
  const { record } = useUndo();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  const grouped = useMemo(() => {
    const map = new Map<SeasonRow["category"], SeasonRow[]>();
    for (const season of currentYearSeasons) {
      const list = map.get(season.category) ?? [];
      list.push(season);
      map.set(season.category, list);
    }
    return map;
  }, [currentYearSeasons]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePropose() {
    const items: ReviewItem[] = currentYearSeasons
      .filter((s) => selected.has(s.id))
      .map((season) => {
        if (TRACKED_CATEGORIES.has(season.category)) {
          const tracked = buildTrackedItem(season, nextYear, priorSourceDates);
          if (tracked) return tracked;
        }
        return buildShiftedItem(season);
      });
    setPhase({ kind: "review", items });
  }

  function updateTrackedValue(
    seasonId: string,
    institution: string,
    field: "start_date" | "end_date",
    value: string
  ) {
    if (phase.kind !== "review") return;
    setPhase({
      kind: "review",
      items: phase.items.map((item) => {
        if (item.kind !== "tracked" || item.seasonId !== seasonId) return item;
        return {
          ...item,
          values: {
            ...item.values,
            [institution]: { ...item.values[institution], [field]: value || null },
          },
        };
      }),
    });
  }

  function updateShiftedField(seasonId: string, patch: Partial<ShiftedReviewItem>) {
    if (phase.kind !== "review") return;
    setPhase({
      kind: "review",
      items: phase.items.map((item) =>
        item.kind === "shifted" && item.seasonId === seasonId ? { ...item, ...patch } : item
      ),
    });
  }

  async function handleSave() {
    if (phase.kind !== "review") return;
    const items = phase.items;
    setPhase({ kind: "saving" });

    const affected: AffectedRow[] = [];
    const lines: SavedLine[] = [];

    // Each selected season is saved independently — one item's failure must
    // not lose items already successfully saved earlier in this same loop,
    // nor block items still to come. Mirrors the Holidays new-year review's
    // per-row success/failure reporting.
    for (const item of items) {
      try {
        if (item.kind === "tracked") {
          const entries: SeasonSourceDateEntry[] = item.group.institutions.map((inst) => ({
            group_name: item.group.groupName,
            institution: inst.name,
            start_date: item.values[inst.name].start_date,
            end_date: item.values[inst.name].end_date,
          }));
          const filled = entries.filter((e) => e.start_date || e.end_date);
          if (filled.length > 0) {
            unwrap(await saveSeasonSourceDates(nextYear, filled));
          }

          const aggregate = computeGroupAggregate(entries);
          const missingCount = Object.keys(item.flags).length;
          const flagText =
            missingCount > 0
              ? `${missingCount} of ${item.group.institutions.length} institutions had no prior data and were left blank — double check before relying on this.`
              : undefined;

          if (!aggregate.startDate || !aggregate.endDate) {
            lines.push({
              name: item.editedName,
              outcome: "not created — not enough dates entered yet",
              flag: flagText,
            });
            continue;
          }

          // Matched on name + category + the TARGET year specifically — a
          // season name with no literal year in it (e.g. "Growth Cycle 1")
          // is otherwise indistinguishable from the current year's own row
          // of the same name, which would wrongly look like a duplicate.
          const existing = allSeasons.find(
            (s) =>
              s.name === item.editedName &&
              s.category === item.group.category &&
              Number(s.start_date.slice(0, 4)) === nextYear
          );
          if (existing) {
            lines.push({ name: item.editedName, outcome: "already exists — left unchanged", flag: flagText });
            continue;
          }

          const created = unwrap(await createSeason({
            name: item.editedName,
            category: item.group.category,
            start_date: aggregate.startDate,
            end_date: aggregate.endDate,
            notes: null,
            color: null,
          }));
          affected.push(...created);
          lines.push({ name: item.editedName, outcome: "created", flag: flagText });
        } else {
          if (!item.editedStart || !item.editedEnd) {
            lines.push({ name: item.editedName, outcome: "not created — missing a date" });
            continue;
          }
          if (item.editedEnd < item.editedStart) {
            lines.push({ name: item.editedName, outcome: "not created — end date before start date" });
            continue;
          }

          const existing = allSeasons.find(
            (s) =>
              s.name === item.editedName &&
              s.category === item.category &&
              Number(s.start_date.slice(0, 4)) === nextYear
          );
          if (existing) {
            lines.push({ name: item.editedName, outcome: "already exists — left unchanged" });
            continue;
          }

          const created = unwrap(await createSeason({
            name: item.editedName,
            category: item.category,
            start_date: item.editedStart,
            end_date: item.editedEnd,
            notes: item.originalNotes,
            color: null,
          }));
          affected.push(...created);
          lines.push({ name: item.editedName, outcome: "created" });
        }
      } catch (err) {
        lines.push({
          name: item.editedName,
          outcome: "failed to save",
          flag: err instanceof Error ? err.message : "Something went wrong saving this one.",
        });
      }
    }

    if (affected.length > 0) record(`Start new year (${nextYear}) seasons`, affected);
    setPhase({ kind: "saved", lines });
  }

  if (phase.kind === "saved") {
    return (
      <div className="max-w-xl rounded-card bg-surface p-5 text-body">
        <p className="mb-2 text-ui font-medium">Created seasons for {nextYear}.</p>
        <ul className="list-disc list-inside flex flex-col gap-1">
          {phase.lines.map((line, i) => (
            <li key={i}>
              {line.name}: {line.outcome}
              {line.flag && <div className="mt-0.5 text-micro text-amber-700">{line.flag}</div>}
            </li>
          ))}
        </ul>
        <Button size="sm" className="mt-4" onClick={() => router.push("/seasons")}>
          Back to Seasons
        </Button>
      </div>
    );
  }

  if (phase.kind === "review" || phase.kind === "saving") {
    const items = phase.kind === "review" ? phase.items : null;
    return (
      <div className="flex flex-col gap-6">
        {items?.map((item) =>
          item.kind === "tracked" ? (
            <div key={item.seasonId} className="flex flex-col gap-2">
              <label className="flex flex-wrap items-center gap-2 text-ui font-medium text-navy">
                Proposed name
                <input
                  value={item.editedName}
                  onChange={(e) => {
                    if (phase.kind !== "review") return;
                    setPhase({
                      kind: "review",
                      items: phase.items.map((it) =>
                        it.kind === "tracked" && it.seasonId === item.seasonId
                          ? { ...it, editedName: e.target.value }
                          : it
                      ),
                    });
                  }}
                  className={`${FIELD_INPUT} !w-64`}
                />
              </label>
              <ExamSourceGroupEditor
                group={item.group}
                values={item.values}
                flags={item.flags}
                onChange={(institution, field, value) =>
                  updateTrackedValue(item.seasonId, institution, field, value)
                }
              />
            </div>
          ) : (
            <div key={item.seasonId} className="rounded-card bg-surface p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className={`flex flex-col gap-1 ${LABEL}`}>
                  Name
                  <input
                    value={item.editedName}
                    onChange={(e) => updateShiftedField(item.seasonId, { editedName: e.target.value })}
                    className={`${FIELD_INPUT} !w-56`}
                  />
                </label>
                <label className={`flex flex-col gap-1 ${LABEL}`}>
                  Start
                  <input
                    type="date"
                    value={item.editedStart}
                    onChange={(e) => updateShiftedField(item.seasonId, { editedStart: e.target.value })}
                    className={FIELD_INPUT}
                  />
                </label>
                <label className={`flex flex-col gap-1 ${LABEL}`}>
                  End
                  <input
                    type="date"
                    value={item.editedEnd}
                    onChange={(e) => updateShiftedField(item.seasonId, { editedEnd: e.target.value })}
                    className={FIELD_INPUT}
                  />
                </label>
                <div className="text-micro text-ink-2 sm:ml-auto">
                  Carried forward: same dates, one year later
                  <div className="text-ink-3">(was {item.originalName})</div>
                </div>
              </div>
            </div>
          )
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={phase.kind === "saving"}>
            {phase.kind === "saving" ? "Saving…" : `Save (${items?.length ?? 0})`}
          </Button>
        </div>
      </div>
    );
  }

  // Form phase: multi-select, grouped by category, all unchecked by default.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">
        Pick which {currentYear} seasons to carry forward into {nextYear}. Nothing is created
        until you review and save.
      </p>
      {currentYearSeasons.length === 0 && (
        <p className="text-body text-ink-2">No seasons found starting in {currentYear}.</p>
      )}
      {Array.from(grouped.entries()).map(([category, seasonsInCategory]) => (
        <div key={category} className="rounded-card bg-surface p-5">
          <h2 className="mb-2 text-ui font-semibold text-navy">{category}</h2>
          <div className="flex flex-col gap-1">
            {seasonsInCategory.map((season) => (
              <label key={season.id} className="flex min-h-[32px] items-center gap-2 text-body">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-navy"
                  checked={selected.has(season.id)}
                  onChange={() => toggle(season.id)}
                />
                {season.name}
                <span className="text-ink-2">
                  ({formatDateDisplay(season.start_date)} – {formatDateDisplay(season.end_date)})
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={handlePropose} disabled={selected.size === 0}>
          Propose for Next Year ({selected.size})
        </Button>
      </div>
    </div>
  );
}
