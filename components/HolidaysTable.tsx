"use client";

import { useMemo, useState, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HolidayModal from "./HolidayModal";
import ConfirmModal from "./ConfirmModal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { deleteHoliday } from "@/lib/holidayActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { HolidayRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";
import { unwrap } from "@/lib/actionResult";
import { TABLE_CARD, TABLE, TH, TD, TR, EMPTY_CELL, ROW_ACTION, TOOLBAR_SELECT } from "./ui/tableStyles";
import Button, { buttonClass } from "./ui/Button";
import IconButton from "./ui/IconButton";
import Pill from "./ui/Pill";
import { PlusIcon, TrashIcon, CheckCircleIcon } from "./icons";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; holiday: HolidayRow };

const ALL_YEARS = "All";

function holidayPillVariant(type: string): "navy" | "ok" | "warn" | "neutral" {
  if (type.startsWith("National")) return "navy";
  if (type === "School Schedule") return "ok";
  if (type === "Church Observance") return "warn";
  return "neutral";
}

export default function HolidaysTable({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter();
  const { record } = useUndo();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HolidayRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEscapeKey(() => setPendingDelete(null));

  function handleRemove(e: MouseEvent, holiday: HolidayRow) {
    e.stopPropagation();
    setDeleteError(null);
    setPendingDelete(holiday);
  }

  async function handleConfirmRemove() {
    if (!pendingDelete) return;
    const holiday = pendingDelete;
    setRemovingId(holiday.id);
    try {
      const affected = unwrap(await deleteHoliday(holiday.id));
      record(`Delete holiday "${holiday.name}"`, affected);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong deleting this holiday."
      );
    } finally {
      setRemovingId(null);
    }
  }

  const years = useMemo(
    () =>
      Array.from(new Set(holidays.map((h) => h.holiday_date.slice(0, 4)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [holidays]
  );

  const filtered = useMemo(() => {
    if (yearFilter === ALL_YEARS) return holidays;
    return holidays.filter((h) => h.holiday_date.slice(0, 4) === yearFilter);
  }, [holidays, yearFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-body text-ink-2">
          Year
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className={TOOLBAR_SELECT}
          >
            <option value={ALL_YEARS}>All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/holidays/new-year?year=${new Date().getFullYear()}`}
            className={buttonClass("secondary", "sm")}
            title="Re-checks Singapore public holidays for the current year via Calendarific — shows any missing ones for your approval, doesn't touch what's already here"
          >
            Update Calendar
          </Link>
          <Link href="/holidays/new-year" className={buttonClass("secondary", "sm")}>
            Start a New Year
          </Link>
          <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} onClick={() => setModal({ type: "add" })}>
            Add Holiday
          </Button>
        </div>
      </div>
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Name</th>
              <th className={TH}>Type</th>
              <th className={`${TH} w-12`}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((holiday) => (
              <tr key={holiday.id} onClick={() => setModal({ type: "edit", holiday })} className={TR}>
                <td className={TD}>{formatDateDisplay(holiday.holiday_date)}</td>
                <td className={`${TD} font-medium`}>{holiday.name}</td>
                <td className={TD}>
                  <Pill variant={holidayPillVariant(holiday.type)}>{holiday.type}</Pill>
                </td>
                <td className={`${TD} text-right`}>
                  <span className={ROW_ACTION}>
                    <IconButton
                      label={`Remove "${holiday.name}"`}
                      icon={<TrashIcon className="!h-4 !w-4" />}
                      onClick={(e) => handleRemove(e, holiday)}
                      disabled={removingId === holiday.id}
                      className="hover:!text-danger"
                    />
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className={EMPTY_CELL}>
                  No holidays{yearFilter !== ALL_YEARS ? ` for ${yearFilter}` : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.type !== "closed" && (
        <HolidayModal
          mode={modal.type}
          holiday={modal.type === "edit" ? modal.holiday : undefined}
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

      {pendingDelete && (
        <ConfirmModal
              message={<>Delete &ldquo;{pendingDelete.name}&rdquo;?</>}
              error={deleteError}
              busy={removingId === pendingDelete.id}
              onClose={() => setPendingDelete(null)}
              onConfirm={handleConfirmRemove}
            />
      )}
    </div>
  );
}
