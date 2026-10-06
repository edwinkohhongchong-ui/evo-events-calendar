"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ConfirmModal from "./ConfirmModal";
import Button, { buttonClass } from "./ui/Button";
import Pill, { PillVariant } from "./ui/Pill";
import { ChevronIcon, CopyIcon, PencilIcon } from "./icons";
import { TABLE_CARD, TABLE, TH, TD } from "./ui/tableStyles";
import { INPUT } from "./ui/fieldStyles";
import { applyScheduleImport } from "@/lib/scheduleImportActions";
import { unwrap } from "@/lib/actionResult";
import { useUndo } from "@/lib/undo/UndoProvider";
import { formatDateDisplay as formatDate, isValidDateStr } from "@/lib/dates";
import { HOLIDAY_TYPES, SEASON_CATEGORIES } from "@/lib/constants";
import type { DiffStatus } from "@/lib/schedules/diff";
import type { FlagCode } from "@/lib/schedules/types";
import type { PlanRow, SchedulePlan } from "@/lib/schedules/planRows";
import { summaryLine } from "@/lib/schedules/holidayCheck";
import type { HolidayCheckRow } from "@/lib/schedules/holidayCheck";
import { describeApply, savedCount } from "@/lib/schedules/applyValidation";
import type { ApplySummary } from "@/lib/schedules/applyValidation";
import {
  blockingProblems,
  buildSelection,
  canTick,
  confirmMessage,
  copyListText,
  defaultSelection,
  effective,
  planCounts,
  selectAllNew,
  selectionCounts,
  weakOverwrites,
  type Drafts,
  type RowDraft,
} from "@/lib/schedules/selection";

const STATUS_LABEL: Record<DiffStatus, string> = { new: "New", changed: "Changed", unchanged: "Unchanged" };
const STATUS_VARIANT: Record<DiffStatus, PillVariant> = { new: "ok", changed: "warn", unchanged: "neutral" };

const FLAG_LABEL: Partial<Record<FlagCode, string>> = {
  tentative: "Tentative",
  "year-mismatch": "Year looks wrong",
  "end-before-start": "End before start",
  "not-published": "Not yet published",
  "unrecognised-label": "Check the label",
  "ambiguous-institution": "Which school?",
  "sunday-mismatch": "Check the date",
  "invalid-date": "Not a real date",
  "no-section": "No section",
  "weak-match": "Matched by name",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  type: "Type",
  category: "Category",
  date: "Date",
  start_date: "Start",
  end_date: "End",
  notes: "Notes",
};

// A half-typed date in the editor must not throw while rendering.
const formatDateDisplay = (d: string) => (isValidDateStr(d) ? formatDate(d) : "(no date)");

function formatChangeValue(field: string, value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && field.includes("date") ? formatDateDisplay(value) : value;
}

function datesText(start: string, end: string): string {
  return start === end ? formatDateDisplay(start) : `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
}

type Phase =
  | { kind: "review" }
  | { kind: "confirm" }
  | { kind: "applying" }
  | { kind: "done"; summary: ApplySummary };

export default function ScheduleImportPreview({ plan, onReset }: { plan: SchedulePlan; onReset: () => void }) {
  const { record, undo, canUndo, isBusy } = useUndo();
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(plan));
  const [drafts, setDrafts] = useState<Drafts>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [undone, setUndone] = useState(false);

  const check = plan.holidayCheck;
  const checkByRow = useMemo(
    () => new Map(check?.status === "ok" ? check.rows.map((c) => [c.rowId, c]) : []),
    [check]
  );

  const counts = useMemo(() => planCounts(plan), [plan]);
  const selection = useMemo(() => buildSelection(plan, selected, drafts), [plan, selected, drafts]);
  const sel = selectionCounts(selection);

  function toggle(row: PlanRow, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(row.rowId);
      else next.delete(row.rowId);
      return next;
    });
  }

  function setDraft(row: PlanRow, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [row.rowId]: { ...effective(row, prev[row.rowId]), ...patch } }));
  }

  function resetDraft(row: PlanRow) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.rowId];
      return next;
    });
  }

  async function copyList() {
    const ids = selected.size ? selected : new Set([...plan.holidays, ...plan.seasons].map((r) => r.rowId));
    try {
      await navigator.clipboard.writeText(copyListText(plan, ids, drafts));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setApplyError("Could not copy to the clipboard. Select the rows and copy them by hand instead.");
    }
  }

  async function apply() {
    setPhase({ kind: "applying" });
    setApplyError(null);
    try {
      const outcome = unwrap(await applyScheduleImport(selection));
      const saved = savedCount(outcome.summary);
      if (saved > 0) record(`Import schedules (${saved} ${saved === 1 ? "row" : "rows"})`, outcome.affected);
      setPhase({ kind: "done", summary: outcome.summary });
    } catch (err) {
      // Nothing was written (validation or permission problem); stay on the preview.
      setApplyError(err instanceof Error ? err.message : "Something went wrong. Nothing was imported.");
      setPhase({ kind: "review" });
    }
  }

  if (phase.kind === "done") {
    const s = phase.summary;
    const saved = savedCount(s);
    return (
      <div className="rounded-card bg-surface p-5 text-body" role="status">
        <p className={`mb-2 text-ui font-medium ${s.failed ? "text-danger" : "text-ink"}`}>
          {s.failed ? "The import stopped part-way." : "Import finished."}
        </p>
        <p className="mb-4 text-ink-2">{describeApply(s)}</p>
        <div className="flex flex-wrap gap-2">
          {saved > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!canUndo || isBusy || undone}
              onClick={() => {
                undo();
                setUndone(true);
              }}
            >
              {undone ? "Undone" : "Undo this import"}
            </Button>
          )}
          <Link href="/seasons" className={buttonClass("secondary", "sm")}>
            Go to Seasons
          </Link>
          <Link href="/holidays" className={buttonClass("secondary", "sm")}>
            Go to Holidays
          </Link>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Read another document
          </Button>
        </div>
      </div>
    );
  }

  const renderTable = (title: string, rows: PlanRow[]) => (
    <section className="mb-6">
      <h2 className="mb-2 text-title text-navy">
        {title} <span className="text-body font-normal text-ink-3">({rows.length})</span>
      </h2>
      {title === "Holidays" && check && <HolidayCheckSummary check={check} />}
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={`${TH} w-12`}>
                <span className="sr-only">Include</span>
              </th>
              <th className={TH}>Status</th>
              <th className={TH}>Name</th>
              <th className={TH}>{title === "Holidays" ? "Type" : "Category"}</th>
              <th className={TH}>Dates</th>
              <th className={TH}>Notes and flags</th>
              <th className={`${TH} w-16`}>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PreviewRow
                key={row.rowId}
                row={row}
                docYear={plan.docYear}
                draft={drafts[row.rowId]}
                check={checkByRow.get(row.rowId)}
                ticked={selected.has(row.rowId)}
                editing={editing === row.rowId}
                onToggle={(on) => toggle(row, on)}
                onEdit={() => setEditing(editing === row.rowId ? null : row.rowId)}
                onDraft={(patch) => setDraft(row, patch)}
                onResetDraft={() => resetDraft(row)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-2">
                  None found in the document.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const missingCount = plan.missingFromDocument.holidays.length + plan.missingFromDocument.seasons.length;
  const looseCount = plan.ignoredLines.length + plan.issues.length;

  return (
    <div>
      <div className="mb-4 rounded-card bg-surface p-4">
        <p className="text-ui font-medium text-ink">
          {plan.title ?? "Schedule document"}
          {plan.docYear ? ` (${plan.docYear})` : ""}
        </p>
        <p className="mt-1 text-body text-ink-2" aria-live="polite">
          {counts.new} new, {counts.changed} changed, {counts.unchanged} unchanged, {counts.needAttention} need attention,{" "}
          {counts.ignored} ignored {counts.ignored === 1 ? "line" : "lines"}
        </p>
        <p className="mt-1 text-micro text-ink-3">
          Nothing is saved until you click Apply. Rows that need attention are flagged; fix or untick them first.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setSelected(selectAllNew(plan, drafts))}>
          Select all new
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
          Select none
        </Button>
        <Button variant="ghost" size="sm" icon={<CopyIcon className="!h-4 !w-4" />} onClick={copyList}>
          {copied ? "Copied" : "Copy list for web check"}
        </Button>
        <span className="ml-auto text-body text-ink-2">
          {selection.length} selected ({sel.add} to add, {sel.update} to update)
        </span>
      </div>

      {applyError && (
        <p role="alert" className="mb-4 rounded-ctl bg-danger/10 px-4 py-3 text-body text-danger">
          {applyError}
        </p>
      )}

      {renderTable("Holidays", plan.holidays)}
      {renderTable("Seasons", plan.seasons)}

      <Collapsible title={`Not in the document (${missingCount})`}>
        <p className="mb-2 text-micro text-ink-3">
          These are already in your calendar for {plan.docYear ?? "this year"} but the document does not mention them. They are left as they are.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-2">
          {[...plan.missingFromDocument.holidays, ...plan.missingFromDocument.seasons].map((m) => (
            <li key={m.id}>
              {m.name} · {datesText(m.start, m.end)}
            </li>
          ))}
          {missingCount === 0 && <li className="list-none">Nothing missing.</li>}
        </ul>
      </Collapsible>

      <Collapsible title={`Lines I couldn't place (${looseCount})`}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-2">
          {plan.issues.map((f, i) => (
            <li key={`i${i}`}>{f.message}</li>
          ))}
          {plan.ignoredLines.map((l) => (
            <li key={l.line}>
              Line {l.line}: {l.text}
            </li>
          ))}
          {looseCount === 0 && <li className="list-none">Every line was understood.</li>}
        </ul>
      </Collapsible>

      <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Start over
        </Button>
        <Button disabled={selection.length === 0 || phase.kind === "applying"} onClick={() => setPhase({ kind: "confirm" })}>
          Apply {selection.length} {selection.length === 1 ? "change" : "changes"}
        </Button>
      </div>

      {(phase.kind === "confirm" || phase.kind === "applying") && (
        <ConfirmModal
          title="Apply import?"
          message={confirmMessage(sel, weakOverwrites(plan, selected, drafts))}
          confirmLabel="Apply"
          busyLabel="Applying…"
          confirmVariant="primary"
          busy={phase.kind === "applying"}
          onClose={() => phase.kind === "confirm" && setPhase({ kind: "review" })}
          onConfirm={apply}
        />
      )}
    </div>
  );
}

function HolidayCheckSummary({ check }: { check: NonNullable<SchedulePlan["holidayCheck"]> }) {
  if (check.status === "unavailable") {
    return (
      <p className="mb-2 rounded-ctl bg-surface px-4 py-3 text-body text-ink-2" role="status">
        Holiday check unavailable: {check.message}. Check manually.
      </p>
    );
  }
  return (
    <div className="mb-2">
      <p className="rounded-ctl bg-surface px-4 py-3 text-body text-ink-2" role="status">
        {summaryLine(check.rows)}
      </p>
      <Collapsible title={`Calendarific holidays not in the document (${check.notInDocument.length})`}>
        <p className="mb-2 text-micro text-ink-3">
          Public holidays Calendarific lists that no row above covers. For information only; nothing is added.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-2">
          {check.notInDocument.map((h) => (
            <li key={`${h.date}${h.name}`}>
              {h.name} · {formatDateDisplay(h.date)}
            </li>
          ))}
          {check.notInDocument.length === 0 && <li className="list-none">Nothing missing.</li>}
        </ul>
      </Collapsible>
    </div>
  );
}

// Advisory only: never changes whether a row is ticked. Hidden once the row is edited, because
// the check ran on the document's values.
function CheckBadge({ check }: { check: HolidayCheckRow }) {
  const text =
    check.result === "match"
      ? "Verified: Calendarific"
      : check.result === "date-differs"
        ? `Calendarific says ${check.calendarificName ?? "this holiday"} on ${check.calendarificDate ? formatDateDisplay(check.calendarificDate) : "another date"}`
        : check.result === "not-found"
          ? "Not found in Calendarific"
          : "Not checked";
  const variant: PillVariant = check.result === "match" ? "ok" : check.result === "date-differs" ? "warn" : "neutral";
  return (
    <div className="mt-1 flex items-start gap-1.5 text-micro text-ink-2" title={check.detail}>
      <Pill variant={variant} className="!whitespace-normal">
        {text}
      </Pill>
      {check.result !== "match" && <span>{check.detail}</span>}
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 overflow-hidden rounded-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-ui font-medium text-ink hover:bg-canvas coarse:min-h-[44px]"
      >
        {title}
        <span className="text-ink-3">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && <div className="border-t border-line px-4 py-3">{children}</div>}
    </div>
  );
}

interface RowProps {
  row: PlanRow;
  docYear: number | null;
  draft: RowDraft | undefined;
  check: HolidayCheckRow | undefined;
  ticked: boolean;
  editing: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onDraft: (patch: Partial<RowDraft>) => void;
  onResetDraft: () => void;
}

function PreviewRow({ row, docYear, draft, check, ticked, editing, onToggle, onEdit, onDraft, onResetDraft }: RowProps) {
  const v = effective(row, draft);
  const problems = blockingProblems(row, draft, docYear);
  const blocked = !canTick(row, draft, docYear);
  const isHoliday = row.kind === "holiday";
  // Once edited, the live check above replaces the document's own error flags.
  const shownFlags = row.flags.filter((f) => !draft || f.severity !== "error");
  const options: readonly string[] = isHoliday ? HOLIDAY_TYPES : SEASON_CATEGORIES;

  return (
    <>
      <tr className={`border-t border-line first:border-t-0 align-top ${blocked ? "bg-danger/5" : ""}`}>
        <td className={TD}>
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center coarse:h-11 coarse:w-11">
            <input
              type="checkbox"
              className="h-4 w-4 accent-navy coarse:h-5 coarse:w-5"
              checked={ticked && !blocked}
              disabled={blocked}
              onChange={(e) => onToggle(e.target.checked)}
              aria-label={`Include ${v.name}`}
            />
          </label>
        </td>
        <td className={TD}>
          <Pill variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Pill>
          {row.changes.length > 0 && (
            <div className="mt-1 whitespace-pre-line text-micro text-ink-2">
              {row.changes.map((c) => (
                <div key={c.field}>
                  {FIELD_LABEL[c.field] ?? c.field}: {formatChangeValue(c.field, c.from)} → {formatChangeValue(c.field, c.to)}
                </div>
              ))}
            </div>
          )}
        </td>
        <td className={`${TD} whitespace-normal font-medium`}>
          {v.name}
          {draft && <span className="ml-1 text-micro font-normal text-ink-3">(edited)</span>}
        </td>
        <td className={`${TD} whitespace-normal text-ink-2`}>{v.category}</td>
        <td className={TD}>{datesText(v.start, isHoliday ? v.start : v.end)}</td>
        <td className={`${TD} min-w-[16rem] max-w-[26rem] whitespace-normal break-words`}>
          {v.notes && <div className="whitespace-pre-line text-body text-ink-2">{v.notes}</div>}
          {problems.map((p, i) => (
            <div key={`p${i}`} className="mt-1 flex items-start gap-1.5 text-micro text-danger">
              <Pill variant="danger">Fix first</Pill>
              <span>{p}</span>
            </div>
          ))}
          {shownFlags.map((f, i) => (
            <div key={i} className={`mt-1 flex items-start gap-1.5 text-micro ${f.severity === "error" ? "text-danger" : "text-ink-2"}`}>
              <Pill variant={f.severity === "error" ? "danger" : "warn"}>{FLAG_LABEL[f.code] ?? "Check"}</Pill>
              <span>{f.message}</span>
            </div>
          ))}
          {check && !draft && <CheckBadge check={check} />}
          {row.possibleDuplicates.map((d) => (
            <div key={d.id} className="mt-1 flex items-start gap-1.5 text-micro text-ink-2">
              <Pill variant="neutral">Duplicate?</Pill>
              <span>
                Possible duplicate of “{d.name} {datesText(d.start, d.end)}”
              </span>
            </div>
          ))}
        </td>
        <td className={`${TD} text-right`}>
          <Button variant="ghost" size="sm" icon={<PencilIcon className="!h-4 !w-4" />} onClick={onEdit} aria-expanded={editing}>
            {editing ? "Done" : "Edit"}
          </Button>
        </td>
      </tr>
      {editing && (
        <tr className="bg-canvas">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-micro font-medium text-ink-2 lg:col-span-2">
                Name
                <input className={INPUT} value={v.name} onChange={(e) => onDraft({ name: e.target.value })} maxLength={200} />
              </label>
              <label className="flex flex-col gap-1 text-micro font-medium text-ink-2 lg:col-span-2">
                {isHoliday ? "Type" : "Category"}
                <select className={INPUT} value={v.category} onChange={(e) => onDraft({ category: e.target.value })}>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-micro font-medium text-ink-2">
                {isHoliday ? "Date" : "Start"}
                <input
                  type="date"
                  className={INPUT}
                  value={v.start}
                  onChange={(e) => onDraft(isHoliday ? { start: e.target.value, end: e.target.value } : { start: e.target.value })}
                />
              </label>
              {!isHoliday && (
                <label className="flex flex-col gap-1 text-micro font-medium text-ink-2">
                  End
                  <input type="date" className={INPUT} value={v.end} onChange={(e) => onDraft({ end: e.target.value })} />
                </label>
              )}
              {!isHoliday && (
                <label className="flex flex-col gap-1 text-micro font-medium text-ink-2 sm:col-span-2">
                  Notes
                  <input className={INPUT} value={v.notes} onChange={(e) => onDraft({ notes: e.target.value })} />
                </label>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              {draft && (
                <Button variant="ghost" size="sm" onClick={onResetDraft}>
                  Reset to the document&apos;s values
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onEdit}>
                Done
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
