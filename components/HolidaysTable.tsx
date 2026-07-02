"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import HolidayModal from "./HolidayModal";
import { HolidayRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; holiday: HolidayRow };

export default function HolidaysTable({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setModal({ type: "add" })}
          className="px-3 py-1.5 text-sm rounded bg-navy text-white"
        >
          Add Holiday
        </button>
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
            {holidays.map((holiday) => (
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
            {holidays.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                  No holidays yet.
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
