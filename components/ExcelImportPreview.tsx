"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConfirmModal from "./ConfirmModal";
import Button, { buttonClass } from "./ui/Button";
import Pill, { PillVariant } from "./ui/Pill";
import { ChevronIcon, CopyIcon, PencilIcon } from "./icons";
import { TABLE_CARD, TABLE, TH, TD, TOOLBAR_SELECT } from "./ui/tableStyles";
import { INPUT, TEXTAREA } from "./ui/fieldStyles";
import { applyExcelImport } from "@/lib/excelImportActions";
import { unwrap } from "@/lib/actionResult";
import { useUndo } from "@/lib/undo/UndoProvider";
import { formatDateDisplay as formatDate, isValidDateStr } from "@/lib/dates";
import { CHECKLIST_STATUSES, HOLIDAY_TYPES, SEASON_CATEGORIES } from "@/lib/constants";
import type { ExcelPlanRow, ExcelStatus } from "@/lib/excelImport/diffExcel";
import type { ExcelRowKind, ExcelApplySummary } from "@/lib/excelImport/applyValidation";
import { describeExcelApply, excelSavedCount } from "@/lib/excelImport/applyValidation";
import { applyInChunks, undoLabel } from "@/lib/excelImport/applyClient";
import type { ExcelParseResponse } from "@/lib/excelImport/responseTypes";
import {
  applyLevelToUnknown,
  blockingProblems,
  buildSelection,
  confirmMessage,
  copyListText,
  defaultSelection,
  duplicateAdds,
  effective,
  eventsWithoutLevel,
  KIND_LABEL,
  KIND_ORDER,
  monthCount,
  notTickableReason,
  planCounts,
  rowsOfKind,
  rowsOfMonth,
  selectAllNew,
  selectionCounts,
  shownFlags,
  tickState,
  toggleGroup,
  weakOverwrites,
  type Drafts,
  type EditContext,
  type RowDraft,
  type TickState,
} from "@/lib/excelImport/selection";

const STATUS_LABEL: Record<ExcelStatus, string> = { new: "New", changed: "Changed", unchanged: "Unchanged", "possible-duplicate": "Possible duplicate" };
const STATUS_VARIANT: Record<ExcelStatus, PillVariant> = { new: "ok", changed: "warn", unchanged: "neutral", "possible-duplicate": "warn" };

const FLAG_LABEL: Record<string, string> = {
  "no-time": "No time",
  "no-name": "No name",
  "multi-event-cell": "Several events in one cell",
  "ambiguous-week-note": "Check the week note",
  "season-no-dates": "No dates",
  "season-date-mismatch": "Dates don't agree",
  "stale-year-in-text": "Year looks wrong",
  "date-outside-month": "Date outside the month",
  "no-weekday-header": "Check the layout",
  "unknown-layout": "Unfamiliar layout",
  "bad-year": "Year looks wrong",
  "event-in-season-row": "Check the row",
  "no-done-flag": "No done marker",
  "level-unknown": "Pick a level",
  "level-not-in-calendar": "Pick a level",
  "gathering-type-unknown": "Gathering type?",
  "season-category-unknown": "Check the category",
  "known-public-holiday": "Public holiday",
  "weak-match": "Matched by name",
  "repeating-event": "Repeating event",
  "possible-duplicate": "Duplicate?",
  "missing-name": "No name",
  "name-too-long": "Name too long",
  "notes-trimmed": "Notes cut",
  "status-advanced": "Already further on",
  "no-update-token": "Read again",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  type: "Type",
  category: "Category",
  date: "Date",
  start_date: "Start",
  end_date: "End",
  time: "Start time",
  end_time: "End time",
  level: "Level",
  status: "Status",
  notes: "Notes",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthTitle = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(0, 4)}`;
const monthShort = (m: string) => (MONTH_NAMES[Number(m.slice(5, 7)) - 1] ?? m).slice(0, 3);

// A half-typed date in the editor must not throw while rendering.
const formatDateDisplay = (d: string) => (isValidDateStr(d) ? formatDate(d) : "(no date)");

function formatChangeValue(field: string, value: string): string {
  if (value === "") return "(empty)";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && field.includes("date") ? formatDateDisplay(value) : value;
}

function dateText(row: ExcelPlanRow, v: RowDraft): string {
  if (row.kind === "checklist") return "Not date-based";
  const start = formatDateDisplay(v.start);
  if (row.kind === "season") return v.start === v.end ? start : `${start} – ${formatDateDisplay(v.end)}`;
  if (row.kind === "event") return v.time ? `${start}, ${v.time}${v.endTime ? `–${v.endTime}` : ""}` : start;
  return start;
}

type Phase =
  | { kind: "review" }
  | { kind: "confirm" }
  | { kind: "applying"; done: number; total: number }
  | { kind: "done"; summary: ExcelApplySummary };

export default function ExcelImportPreview({ result, onReset }: { result: ExcelParseResponse; onReset: () => void }) {
  const { plan, levels } = result;
  const { record, undo, canUndo, isBusy } = useUndo();
  const ctx: EditContext = useMemo(() => ({ levels, docYear: plan.docYear }), [levels, plan.docYear]);
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(plan, { levels, docYear: plan.docYear }));
  const [drafts, setDrafts] = useState<Drafts>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [undone, setUndone] = useState(false);
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const [bulkLevel, setBulkLevel] = useState("");
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const listTop = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => planCounts(plan), [plan]);
  const selection = useMemo(() => buildSelection(plan, selected, drafts, ctx), [plan, selected, drafts, ctx]);
  const sel = selectionCounts(selection);

  // Months to list: every month of the workbook's year (so the strip is Jan..Dec) plus any other month the rows touch.
  const months = useMemo(() => {
    const set = new Set(plan.months.map((m) => m.month));
    if (plan.docYear !== null) for (let i = 1; i <= 12; i++) set.add(`${plan.docYear}-${String(i).padStart(2, "0")}`);
    return Array.from(set).sort();
  }, [plan]);
  const shownMonths = focusMonth ? [focusMonth] : months.filter((m) => monthCount(plan, m) > 0);

  const levelScope = focusMonth ? new Set([focusMonth]) : null;
  const unknownLevel = eventsWithoutLevel(plan, drafts, levelScope);
  const scopeText = focusMonth ? monthTitle(focusMonth) : "all months";

  function toggle(row: ExcelPlanRow, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(row.rowId);
      else next.delete(row.rowId);
      return next;
    });
  }

  function setDraft(row: ExcelPlanRow, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [row.rowId]: { ...effective(row, prev[row.rowId]), ...patch } }));
  }

  function resetDraft(row: ExcelPlanRow) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.rowId];
      return next;
    });
  }

  function chooseMonth(m: string) {
    setFocusMonth((cur) => (cur === m ? null : m));
    listTop.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function applyBulkLevel() {
    if (!bulkLevel) return;
    const out = applyLevelToUnknown(plan, drafts, selected, bulkLevel, levelScope, ctx);
    setDrafts(out.drafts);
    setSelected(out.selected);
    setLevelNote(`Set ${bulkLevel} on ${out.changed} ${out.changed === 1 ? "event" : "events"} in ${scopeText}.`);
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(copyListText(plan, selected, drafts));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setApplyError("Could not copy to the clipboard. Select the rows and copy them by hand instead.");
    }
  }

  async function apply() {
    setPhase({ kind: "applying", done: 0, total: selection.length });
    setApplyError(null);
    try {
      const outcome = await applyInChunks(selection, async (rows) => unwrap(await applyExcelImport(rows)), {
        onProgress: (done, total) => setPhase({ kind: "applying", done, total }),
      });
      const saved = excelSavedCount(outcome.summary);
      // ONE Undo for the whole import, however many batches it took (and for a partial one, what was saved).
      if (saved > 0) record(undoLabel(saved), outcome.affected);
      setPhase({ kind: "done", summary: outcome.summary });
    } catch (err) {
      // The first batch was rejected before anything was written; stay on the preview.
      setApplyError(err instanceof Error ? err.message : "Something went wrong. Nothing was imported.");
      setPhase({ kind: "review" });
    }
  }

  if (phase.kind === "done") {
    const s = phase.summary;
    const saved = excelSavedCount(s);
    return (
      <div className="rounded-card bg-surface p-5 text-body" role="status">
        <p className={`mb-2 text-ui font-medium ${s.failed ? "text-danger" : "text-ink"}`}>
          {s.failed ? "The import stopped part-way." : "Import finished."}
        </p>
        <p className="mb-4 text-ink-2">{describeExcelApply(s)}</p>
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
          <Link href="/" className={buttonClass("secondary", "sm")}>
            Go to the calendar
          </Link>
          <Link href="/seasons" className={buttonClass("secondary", "sm")}>
            Go to Seasons
          </Link>
          <Link href="/checklist" className={buttonClass("secondary", "sm")}>
            Go to Checklist
          </Link>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Read another workbook
          </Button>
        </div>
      </div>
    );
  }

  const busy = phase.kind === "applying";
  const missing = plan.missingFromWorkbook;
  const missingAll = [...missing.events, ...missing.seasons, ...missing.holidays, ...missing.checklist];
  const missingTotal = plan.summary.missing.events + plan.summary.missing.seasons + plan.summary.missing.holidays + plan.summary.missing.checklist;
  const loose = result.notes.sheetFlags.length + result.notes.ignoredSheets.length;

  const group = (kind: ExcelRowKind, rows: ExcelPlanRow[], keyPrefix: string) => (
    <Group key={`${keyPrefix}${kind}`} title={KIND_LABEL[kind]} count={rows.length}>
      <RowTable
        kind={kind}
        rows={rows}
        drafts={drafts}
        selected={selected}
        editing={editing}
        ctx={ctx}
        levels={levels}
        onToggle={toggle}
        onEdit={(id) => setEditing(editing === id ? null : id)}
        onDraft={setDraft}
        onResetDraft={resetDraft}
      />
    </Group>
  );

  return (
    <div>
      <div className="mb-4 rounded-card bg-surface p-4">
        <p className="text-ui font-medium text-ink">
          {result.fileName || "Events calendar workbook"}
          {plan.docYear ? ` (${plan.docYear})` : ""}
        </p>
        <p className="mt-1 text-body text-ink-2" aria-live="polite">
          {counts.new} new, {counts.changed} changed, {counts.unchanged} unchanged, {counts.possibleDuplicates} possible{" "}
          {counts.possibleDuplicates === 1 ? "duplicate" : "duplicates"}, {counts.needAttention} need attention
        </p>
        <p className="mt-1 text-micro text-ink-3">
          {counts.byKind.event} events, {counts.byKind.season} seasons, {counts.byKind.holiday} observances, {counts.byKind.checklist} checklist items. Nothing is saved
          until you click Apply. Rows that need attention are flagged; fix or untick them first.
        </p>
        {result.truncated && (
          <p className="mt-1 text-micro text-warn">Some very long cell text was cut short when the workbook was read.</p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setSelected(selectAllNew(plan, drafts, ctx))}>
          Select all new
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
          Select none
        </Button>
        {KIND_ORDER.map((k) => {
          const t = tickState(rowsOfKind(plan, k), selected, drafts, ctx);
          return (
            <Button
              key={k}
              variant="ghost"
              size="sm"
              disabled={t.eligible === 0}
              aria-pressed={t.state === "all"}
              title={`Tick or untick every ${KIND_LABEL[k].toLowerCase()} row that is safe to tick (not a duplicate or a name-only match)`}
              onClick={() => setSelected(toggleGroup(rowsOfKind(plan, k), selected, drafts, ctx))}
            >
              {t.state === "all" ? "Untick" : "Tick"} {KIND_LABEL[k].toLowerCase()}
            </Button>
          );
        })}
        <Button variant="ghost" size="sm" icon={<CopyIcon className="!h-4 !w-4" />} onClick={copyList}>
          {copied ? "Copied" : "Copy list for web check"}
        </Button>
        <span className="ml-auto text-body text-ink-2" aria-live="polite">
          {selection.length} selected ({sel.add} to add, {sel.update} to update)
        </span>
      </div>

      {unknownLevel.length > 0 && (
        <div className="mb-3 rounded-card bg-surface p-4">
          <p className="text-body font-medium text-ink">
            {unknownLevel.length} new {unknownLevel.length === 1 ? "event has" : "events have"} no level yet ({scopeText})
          </p>
          <p className="mt-1 text-micro text-ink-3">
            Choose a level and it is set on every new event in {scopeText} that has none, and those events are ticked. Events that already have a level, and events
            in other months, are not changed.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className={TOOLBAR_SELECT} value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value)} aria-label="Level to set">
              <option value="">Choose a level…</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!bulkLevel} onClick={applyBulkLevel}>
              Apply to {unknownLevel.length} {unknownLevel.length === 1 ? "event" : "events"} without a level
            </Button>
          </div>
        </div>
      )}
      {levelNote && (
        <p role="status" className="mb-3 text-body text-ink-2">
          {levelNote}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Months">
        {months.map((m) => {
          const rows = rowsOfMonth(plan, m);
          const t = tickState(rows, selected, drafts, ctx);
          return (
            <MonthChip
              key={m}
              label={monthShort(m)}
              total={rows.length}
              state={t.state}
              eligible={t.eligible}
              active={focusMonth === m}
              onTick={() => setSelected(toggleGroup(rows, selected, drafts, ctx))}
              onPick={() => chooseMonth(m)}
            />
          );
        })}
        {focusMonth && (
          <Button variant="ghost" size="sm" onClick={() => setFocusMonth(null)}>
            Show all months
          </Button>
        )}
      </div>

      {applyError && (
        <p role="alert" className="mb-4 rounded-ctl bg-danger/10 px-4 py-3 text-body text-danger">
          {applyError}
        </p>
      )}

      <div ref={listTop} className="scroll-mt-16">
        {shownMonths.map((m) => {
          const rows = rowsOfMonth(plan, m);
          return (
            <section key={m} id={`excel-month-${m}`} className="mb-6">
              <h2 className="mb-2 text-title text-navy">
                {monthTitle(m)} <span className="text-body font-normal text-ink-3">({rows.length})</span>
              </h2>
              {rows.length === 0 && <p className="text-body text-ink-2">Nothing in the workbook for this month.</p>}
              {(["event", "season", "holiday"] as const).map((k) => {
                const part = rows.filter((r) => r.kind === k);
                return part.length > 0 ? group(k, part, m) : null;
              })}
            </section>
          );
        })}
        {shownMonths.length === 0 && <p className="mb-6 text-body text-ink-2">No dated rows were found in the workbook.</p>}

        {plan.checklist.length > 0 && !focusMonth && (
          <section className="mb-6">
            <h2 className="mb-2 text-title text-navy">
              Checklist <span className="text-body font-normal text-ink-3">({plan.checklist.length})</span>
            </h2>
            <p className="mb-2 text-micro text-ink-3">
              Not tied to a month. A changed item is never ticked for you: it could overwrite progress someone already recorded.
            </p>
            {group("checklist", plan.checklist, "all")}
          </section>
        )}
      </div>

      <Collapsible title={`In the calendar but not in the workbook (${missingTotal})`}>
        <p className="mb-2 text-micro text-ink-3">
          These are already in your calendar for {plan.docYear ?? "this year"} but the workbook does not mention them. They are left as they are.
          {missingTotal > missingAll.length ? ` Showing the first ${missingAll.length}.` : ""}
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-2">
          {missingAll.map((m) => (
            <li key={`${m.kind}${m.id}`}>
              {KIND_LABEL[m.kind]}: {m.name}
              {m.start ? ` · ${m.start === m.end ? formatDateDisplay(m.start) : `${formatDateDisplay(m.start)} – ${formatDateDisplay(m.end)}`}` : ""}
            </li>
          ))}
          {missingAll.length === 0 && <li className="list-none">Nothing missing.</li>}
        </ul>
      </Collapsible>

      <Collapsible title={`Lines I couldn't place (${loose})`}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-2">
          {result.notes.sheetFlags.map((f, i) => (
            <li key={`f${i}`}>
              {f.sheet} {f.cell}: {f.message}
            </li>
          ))}
          {result.notes.ignoredSheets.map((s) => (
            <li key={`s${s}`}>Sheet “{s}” was skipped (it is not a month or the checklist).</li>
          ))}
          {loose === 0 && <li className="list-none">Every sheet was understood.</li>}
        </ul>
      </Collapsible>

      <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Start over
        </Button>
        <Button disabled={selection.length === 0 || busy} onClick={() => setPhase({ kind: "confirm" })}>
          Apply {selection.length} {selection.length === 1 ? "change" : "changes"}
        </Button>
      </div>

      {(phase.kind === "confirm" || phase.kind === "applying") && (
        <ConfirmModal
          title="Apply import?"
          message={confirmMessage(sel, weakOverwrites(plan, selected, drafts, ctx), duplicateAdds(plan, selected, drafts, ctx))}
          confirmLabel="Apply"
          busyLabel={phase.kind === "applying" && phase.total > 0 ? `Applying… ${phase.done} of ${phase.total}` : "Applying…"}
          confirmVariant="primary"
          busy={phase.kind === "applying"}
          onClose={() => phase.kind === "confirm" && setPhase({ kind: "review" })}
          onConfirm={apply}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MonthChip({
  label,
  total,
  state,
  eligible,
  active,
  onTick,
  onPick,
}: {
  label: string;
  total: number;
  state: TickState;
  eligible: number;
  active: boolean;
  onTick: () => void;
  onPick: () => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = state === "some";
  }, [state]);
  return (
    <div
      className={`inline-flex items-center rounded-pill border text-body ${active ? "border-navy bg-navy-50" : "border-line-strong bg-surface"} ${total === 0 ? "opacity-50" : ""}`}
    >
      <label className="flex h-8 w-8 cursor-pointer items-center justify-center coarse:h-11 coarse:w-11" title={eligible ? "Tick or untick this month's rows" : "Nothing to tick this month"}>
        <input
          ref={box}
          type="checkbox"
          className="h-4 w-4 accent-navy"
          checked={state === "all"}
          disabled={eligible === 0}
          onChange={onTick}
          aria-label={`Tick all of ${label}`}
        />
      </label>
      <button
        type="button"
        onClick={onPick}
        disabled={total === 0}
        aria-pressed={active}
        title={active ? "Show all months" : "Show only this month"}
        className="min-h-[32px] pr-3 font-medium text-ink coarse:min-h-[44px]"
      >
        {label} <span className="text-ink-3">{total}</span>
      </button>
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-1 flex min-h-[32px] items-center gap-1 text-ui font-medium text-ink coarse:min-h-[44px]"
      >
        <span className="text-ink-3">
          <ChevronIcon open={open} />
        </span>
        {title} <span className="text-body font-normal text-ink-3">({count})</span>
      </button>
      {open && children}
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

interface TableProps {
  kind: ExcelRowKind;
  rows: ExcelPlanRow[];
  drafts: Drafts;
  selected: Set<string>;
  editing: string | null;
  ctx: EditContext;
  levels: string[];
  onToggle: (row: ExcelPlanRow, on: boolean) => void;
  onEdit: (id: string) => void;
  onDraft: (row: ExcelPlanRow, patch: Partial<RowDraft>) => void;
  onResetDraft: (row: ExcelPlanRow) => void;
}

function RowTable({ kind, rows, drafts, selected, editing, ctx, levels, onToggle, onEdit, onDraft, onResetDraft }: TableProps) {
  const categoryHead = kind === "event" ? "Level" : kind === "season" ? "Category" : kind === "holiday" ? "Type" : "Section";
  return (
    <div className={TABLE_CARD}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={`${TH} w-12`}>
              <span className="sr-only">Include</span>
            </th>
            <th className={TH}>Status</th>
            <th className={TH}>{kind === "checklist" ? "Item" : "Name"}</th>
            <th className={TH}>{categoryHead}</th>
            <th className={TH}>Date and time</th>
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
              draft={drafts[row.rowId]}
              ctx={ctx}
              levels={levels}
              ticked={selected.has(row.rowId)}
              editing={editing === row.rowId}
              onToggle={(on) => onToggle(row, on)}
              onEdit={() => onEdit(row.rowId)}
              onDraft={(patch) => onDraft(row, patch)}
              onResetDraft={() => onResetDraft(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  row: ExcelPlanRow;
  draft: RowDraft | undefined;
  ctx: EditContext;
  levels: string[];
  ticked: boolean;
  editing: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onDraft: (patch: Partial<RowDraft>) => void;
  onResetDraft: () => void;
}

function PreviewRow({ row, draft, ctx, levels, ticked, editing, onToggle, onEdit, onDraft, onResetDraft }: RowProps) {
  const v = effective(row, draft);
  const problems = blockingProblems(row, draft, ctx);
  const blocked = problems.length > 0;
  const noOp = row.op === null;
  const flags = shownFlags(row, draft);
  const pickLevel = row.kind === "event" && v.category.trim() === "";

  return (
    <>
      <tr className={`border-t border-line first:border-t-0 align-top ${blocked && !noOp ? "bg-danger/5" : ""} ${noOp ? "text-ink-2" : ""}`}>
        <td className={TD}>
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center coarse:h-11 coarse:w-11" title={blocked ? problems.join(" ") : undefined}>
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
          {row.status === "possible-duplicate" &&
            row.possibleDuplicates.map((d) => (
              <div key={d.id} className="mt-1 whitespace-normal text-micro text-ink-2">
                Calendar has “{d.name}” on {formatDateDisplay(d.start)}
                {d.time ? ` at ${d.time}` : ""}
              </div>
            ))}
          {row.existing && row.matchKind && row.matchKind !== "exact" && row.matchKind !== "overlap" && (
            <div className="mt-1 whitespace-normal text-micro text-ink-2">
              Matched “{row.existing.name}”{row.existing.start ? ` on ${formatDateDisplay(row.existing.start)}` : ""}
            </div>
          )}
        </td>
        <td className={`${TD} whitespace-normal font-medium`}>
          {v.name || <span className="text-ink-3">(no name)</span>}
          {draft && <span className="ml-1 text-micro font-normal text-ink-3">(edited)</span>}
        </td>
        <td className={`${TD} whitespace-normal text-ink-2`}>
          {pickLevel ? <span className="text-warn">Pick a level</span> : v.category}
        </td>
        <td className={TD}>{dateText(row, v)}</td>
        <td className={`${TD} min-w-[16rem] max-w-[26rem] whitespace-normal`}>
          {v.notes && <div className="whitespace-pre-line text-body text-ink-2">{v.notes}</div>}
          {noOp && row.status !== "unchanged" && <div className="mt-1 text-micro text-ink-2">{notTickableReason(row)}</div>}
          {!noOp &&
            problems.map((p, i) => (
              <div key={`p${i}`} className="mt-1 flex items-start gap-1.5 text-micro text-danger">
                <Pill variant="danger">Fix first</Pill>
                <span>{p}</span>
              </div>
            ))}
          {flags.map((f, i) => (
            <div key={i} className={`mt-1 flex items-start gap-1.5 text-micro ${f.severity === "error" ? "text-danger" : "text-ink-2"}`}>
              <Pill variant={f.severity === "error" ? "danger" : "warn"}>{FLAG_LABEL[f.code] ?? "Check"}</Pill>
              <span>{f.message}</span>
            </div>
          ))}
        </td>
        <td className={`${TD} text-right`}>
          <Button
            variant="ghost"
            size="sm"
            icon={<PencilIcon className="!h-4 !w-4" />}
            onClick={onEdit}
            aria-expanded={editing}
            disabled={noOp}
            title={noOp ? notTickableReason(row) : undefined}
          >
            {editing ? "Done" : "Edit"}
          </Button>
        </td>
      </tr>
      {editing && !noOp && (
        <tr className="bg-canvas">
          <td colSpan={7} className="px-4 py-3">
            <RowEditor row={row} v={v} levels={levels} draft={draft} onDraft={onDraft} onResetDraft={onResetDraft} onDone={onEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

const FIELD = "flex flex-col gap-1 text-micro font-medium text-ink-2";

function RowEditor({
  row,
  v,
  levels,
  draft,
  onDraft,
  onResetDraft,
  onDone,
}: {
  row: ExcelPlanRow;
  v: RowDraft;
  levels: string[];
  draft: RowDraft | undefined;
  onDraft: (patch: Partial<RowDraft>) => void;
  onResetDraft: () => void;
  onDone: () => void;
}) {
  const kind = row.kind;
  // An existing event is only changed in its time, level and notes (never its name or date).
  const updating = row.op === "update";
  const notes = (
    <label className={`${FIELD} sm:col-span-2 lg:col-span-4`}>
      Notes
      <textarea className={TEXTAREA} rows={2} value={v.notes} onChange={(e) => onDraft({ notes: e.target.value })} />
    </label>
  );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kind === "event" && (
          <>
            <label className={`${FIELD} lg:col-span-2`}>
              Name
              <input className={INPUT} value={v.name} disabled={updating} onChange={(e) => onDraft({ name: e.target.value })} maxLength={200} />
            </label>
            <label className={FIELD}>
              Date
              <input type="date" className={INPUT} value={v.start} disabled={updating} onChange={(e) => onDraft({ start: e.target.value, end: e.target.value })} />
            </label>
            <label className={FIELD}>
              Level (required)
              <select className={INPUT} value={v.category} onChange={(e) => onDraft({ category: e.target.value })}>
                <option value="">Choose a level…</option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              Start time
              <input type="time" className={INPUT} value={v.time} onChange={(e) => onDraft({ time: e.target.value })} />
            </label>
            <label className={FIELD}>
              End time
              <input type="time" className={INPUT} value={v.endTime} onChange={(e) => onDraft({ endTime: e.target.value })} />
            </label>
            {notes}
          </>
        )}
        {kind === "season" && (
          <>
            <label className={`${FIELD} lg:col-span-2`}>
              Name
              <input className={INPUT} value={v.name} onChange={(e) => onDraft({ name: e.target.value })} maxLength={200} />
            </label>
            <label className={`${FIELD} lg:col-span-2`}>
              Category
              <select className={INPUT} value={v.category} onChange={(e) => onDraft({ category: e.target.value })}>
                {SEASON_CATEGORIES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              Start
              <input type="date" className={INPUT} value={v.start} onChange={(e) => onDraft({ start: e.target.value })} />
            </label>
            <label className={FIELD}>
              End
              <input type="date" className={INPUT} value={v.end} onChange={(e) => onDraft({ end: e.target.value })} />
            </label>
            {notes}
          </>
        )}
        {kind === "holiday" && (
          <>
            <label className={`${FIELD} lg:col-span-2`}>
              Name
              <input className={INPUT} value={v.name} onChange={(e) => onDraft({ name: e.target.value })} maxLength={200} />
            </label>
            <label className={FIELD}>
              Date
              <input type="date" className={INPUT} value={v.start} onChange={(e) => onDraft({ start: e.target.value, end: e.target.value })} />
            </label>
            <p className="self-end text-micro text-ink-3">Type: {HOLIDAY_TYPES.includes(v.category as never) ? v.category : "Observance"} (not changed here)</p>
          </>
        )}
        {kind === "checklist" && (
          <>
            <label className={`${FIELD} lg:col-span-2`}>
              Item
              <input className={INPUT} value={v.name} disabled={updating} onChange={(e) => onDraft({ name: e.target.value })} maxLength={300} />
            </label>
            <label className={FIELD}>
              Status
              <select className={INPUT} value={v.status} onChange={(e) => onDraft({ status: e.target.value })}>
                {CHECKLIST_STATUSES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <p className="self-end text-micro text-ink-3">Section: {v.category}</p>
            {notes}
          </>
        )}
      </div>
      {updating && (
        <p className="mt-2 text-micro text-ink-3">
          This event is already in the calendar, so its name and date stay as they are. Only the time, level and notes are updated.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {draft && (
          <Button variant="ghost" size="sm" onClick={onResetDraft}>
            Reset to the workbook&apos;s values
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}
