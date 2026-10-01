"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ChecklistModal from "./ChecklistModal";
import ErrorBanner from "./ErrorBanner";
import { ChecklistRow, ChecklistStatus, EventOption, SeasonRow } from "@/lib/types";
import { CHECKLIST_STATUSES, STATUS_COLORS, TARGET_MONTHS } from "@/lib/constants";
import { updateChecklistStatus, updateChecklistItem, logCheckCalendarSummary } from "@/lib/checklistActions";
import { AUTO_CHECKS } from "@/lib/checklistAutoChecks";
import { useUndo } from "@/lib/undo/UndoProvider";
import { AffectedRow } from "@/lib/undo/types";
import { unwrap } from "@/lib/actionResult";
import { TABLE_CARD, TABLE, TH, TD, TR, EMPTY_CELL, TOOLBAR_SELECT } from "./ui/tableStyles";
import Button from "./ui/Button";
import { PlusIcon, CheckCircleIcon } from "./icons";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; item: ChecklistRow };

const ALL_MONTHS = "All";

export default function ChecklistTable({
  checklist,
  eventOptions,
  seasons,
}: {
  checklist: ChecklistRow[];
  eventOptions: EventOption[];
  seasons: SeasonRow[];
}) {
  const router = useRouter();
  const { record } = useUndo();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [monthFilter, setMonthFilter] = useState<string>(ALL_MONTHS);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusOverride, setStatusOverride] = useState<{ id: string; status: ChecklistStatus } | null>(
    null
  );

  useEffect(() => {
    if (!isPending) setStatusOverride(null);
  }, [isPending]);

  const displayChecklist = useMemo(() => {
    if (!statusOverride) return checklist;
    return checklist.map((row) =>
      row.id === statusOverride.id ? { ...row, status: statusOverride.status } : row
    );
  }, [checklist, statusOverride]);

  const filtered = useMemo(() => {
    if (monthFilter === ALL_MONTHS) return displayChecklist;
    if (monthFilter === "None") return displayChecklist.filter((row) => !row.target_month);
    return displayChecklist.filter((row) => row.target_month === monthFilter);
  }, [displayChecklist, monthFilter]);

  async function handleStatusChange(row: ChecklistRow, status: ChecklistStatus) {
    setStatusOverride({ id: row.id, status });
    try {
      const affected = unwrap(await updateChecklistStatus(row.id, status));
      record(`Set "${row.item}" to ${status}`, affected);
      startTransition(() => router.refresh());
    } catch (err) {
      setStatusOverride(null);
      setError(
        err instanceof Error ? err.message : "Couldn't update that status — it's back to what it was. Please try again."
      );
    }
  }

  // Reconciles status against each item's linked event — Done when linked,
  // Not Started when not. The link itself already goes back to null the
  // moment its event is deleted (ON DELETE SET NULL, migration 014), so
  // this is a plain read of current state, not a fresh scan against the
  // calendar each time.
  async function handleCheckCalendar() {
    setChecking(true);
    setError(null);
    try {
      const toUpdate = checklist.filter((row) => {
        const expected: ChecklistStatus = row.linked_event_id ? "Done" : "Not Started";
        return row.status !== expected && (row.linked_event_id || row.status === "Done");
      });
      const affected: AffectedRow[] = [];
      for (const row of toUpdate) {
        const expected: ChecklistStatus = row.linked_event_id ? "Done" : "Not Started";
        affected.push(...(unwrap(await updateChecklistStatus(row.id, expected, undefined, true))));
      }
      if (affected.length > 0) record("Check Calendar", affected);

      // Additive: run each item's tagged automated check (see
      // lib/checklistAutoChecks.ts) and flag failures in its notes. Does not
      // touch status, and never overwrites existing notes content — it only
      // appends a line, and skips appending if that exact line is already
      // present (e.g. from a previous "Check Calendar" run where the
      // underlying problem hasn't been fixed yet).
      const autoCheckAffected: AffectedRow[] = [];
      for (const row of checklist) {
        if (!row.auto_check_type) continue;
        const checkFn = AUTO_CHECKS[row.auto_check_type];
        if (!checkFn) continue;
        const result = await checkFn(row, { seasons });
        if (result.ok || !result.note) continue;
        const existingNotes = row.notes ?? "";
        if (existingNotes.includes(result.note)) continue;
        const newNotes = existingNotes ? `${existingNotes}\n${result.note}` : result.note;
        const values = {
          category: row.category,
          item: row.item,
          status: row.status,
          target_month: row.target_month,
          notes: newNotes,
          linked_event_id: row.linked_event_id,
          auto_check_type: row.auto_check_type,
        };
        autoCheckAffected.push(...(unwrap(await updateChecklistItem(row.id, values, undefined, true))));
      }
      if (autoCheckAffected.length > 0) record("Check Calendar (automated checks)", autoCheckAffected);

      // One bell entry for the whole run (the per-item updates above are quiet).
      const changed = new Set([...affected, ...autoCheckAffected].map((a) => a.id)).size;
      if (changed > 0) await logCheckCalendarSummary(changed);

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish checking the calendar. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-body text-ink-2">
          Target month
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className={TOOLBAR_SELECT}
          >
            <option value={ALL_MONTHS}>All</option>
            <option value="None">No target month</option>
            {TARGET_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckCalendar}
            loading={checking}
            title="Marks each linked item Done, and reverts to Not Started if its link is gone"
          >
            {checking ? "Checking…" : "Check Calendar"}
          </Button>
          <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} onClick={() => setModal({ type: "add" })}>
            Add Item
          </Button>
        </div>
      </div>
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Category</th>
              <th className={TH}>Item</th>
              <th className={TH}>Status</th>
              <th className={TH}>Target Month</th>
              <th className={TH}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} onClick={() => setModal({ type: "edit", item: row })} className={TR}>
                <td className={`${TD} text-ink-2`}>{row.category}</td>
                <td className={`${TD} font-medium`}>
                  <span className="flex items-center gap-1.5">
                    {row.item}
                    {row.auto_check_type && (
                      <span
                        title="Automated check — “Check Calendar” tests this item's rule"
                        className="text-ink-3"
                      >
                        <CheckCircleIcon className="!h-4 !w-4" />
                      </span>
                    )}
                  </span>
                </td>
                <td className={TD} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.status}
                    onChange={(e) => handleStatusChange(row, e.target.value as ChecklistStatus)}
                    className={[
                      "cursor-pointer rounded-pill border px-3 py-1 text-body font-medium",
                      STATUS_COLORS[row.status],
                    ].join(" ")}
                  >
                    {CHECKLIST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={TD}>{row.target_month ?? "—"}</td>
                <td className={`${TD} max-w-[200px] truncate text-ink-2`}>{row.notes}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className={EMPTY_CELL}>
                  No checklist items{monthFilter !== ALL_MONTHS ? " for this month" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.type !== "closed" && (
        <ChecklistModal
          mode={modal.type}
          item={modal.type === "edit" ? modal.item : undefined}
          eventOptions={eventOptions}
          onClose={() => setModal({ type: "closed" })}
          onSaved={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
          onDeleted={() => {
            setModal({ type: "closed" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
