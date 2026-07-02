"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HolidayModal from "./HolidayModal";
import { HolidayRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; holiday: HolidayRow };

const ALL_YEARS = "All";

export default function HolidaysTable({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);

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
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          Year
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value={ALL_YEARS}>All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Link
            href="/holidays/new-year"
            className="px-3 py-1.5 text-sm rounded border border-navy text-navy"
          >
            Start a New Year
          </Link>
          <button
            onClick={() => setModal({ type: "add" })}
            className="px-3 py-1.5 text-sm rounded bg-navy text-white"
          >
            Add Holiday
          </button>
        </div>
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-navy text-white text-left">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((holiday) => (
              <tr
                key={holiday.id}
                onClick={() => setModal({ type: "edit", holiday })}
                className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateDisplay(holiday.holiday_date)}
                </td>
                <td className="px-3 py-2">{holiday.name}</td>
                <td className="px-3 py-2 text-gray-600">{holiday.type}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
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
    </div>
  );
}
