"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ChecklistModal from "./ChecklistModal";
import ErrorBanner from "./ErrorBanner";
import { ChecklistRow, ChecklistStatus, EventOption } from "@/lib/types";
import { CHECKLIST_STATUSES, STATUS_COLORS, TARGET_MONTHS } from "@/lib/constants";
import { updateChecklistStatus } from "@/lib/checklistActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { AffectedRow } from "@/lib/undo/types";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; item: ChecklistRow };

const ALL_MONTHS = "All";

export default function ChecklistTable({
  checklist,
  eventOptions,
}: {
  checklist: ChecklistRow[];
  eventOptions: EventOption[];
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
      const affected = await updateChecklistStatus(row.id, status);
      record(`Set "${row.item}" to ${status}`, affected);
      startTransition(() => router.refresh());
    } catch {
      setStatusOverride(null);
      setError("Couldn't update that status — it's back to what it was. Please try again.");
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
        affected.push(...(await updateChecklistStatus(row.id, expected)));
      }
      if (affected.length > 0) record("Check Calendar", affected);
      router.refresh();
    } catch {
      setError("Couldn't finish checking the calendar. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          Target month
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border rounded px-2 py-1"
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
        <div className="flex gap-2">
          <button
            onClick={handleCheckCalendar}
            disabled={checking}
            title="Marks each linked item Done, and reverts to Not Started if its link is gone"
            className="px-3 py-1.5 text-sm rounded border border-navy text-navy disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check Calendar"}
          </button>
          <button
            onClick={() => setModal({ type: "add" })}
            className="px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            Add Item
          </button>
        </div>
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-navy text-white text-left">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Target Month</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                onClick={() => setModal({ type: "edit", item: row })}
                className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-2 text-gray-600">{row.category}</td>
                <td className="px-3 py-2">{row.item}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.status}
                    onChange={(e) => handleStatusChange(row, e.target.value as ChecklistStatus)}
                    className={[
                      "text-xs px-2 py-1 rounded border font-medium",
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
                <td className="px-3 py-2">{row.target_month ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{row.notes}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
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
