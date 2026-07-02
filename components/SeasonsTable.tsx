"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SeasonModal from "./SeasonModal";
import { SeasonRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; season: SeasonRow };

export default function SeasonsTable({ seasons }: { seasons: SeasonRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setModal({ type: "add" })}
          className="px-3 py-1.5 text-sm rounded bg-navy text-white"
        >
          Add Season
        </button>
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-navy text-white text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) => (
              <tr
                key={season.id}
                onClick={() => setModal({ type: "edit", season })}
                className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-2">{season.name}</td>
                <td className="px-3 py-2 text-gray-600">{season.category}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateDisplay(season.start_date)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateDisplay(season.end_date)}
                </td>
                <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">
                  {season.notes}
                </td>
              </tr>
            ))}
            {seasons.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  No seasons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.type !== "closed" && (
        <SeasonModal
          mode={modal.type}
          season={modal.type === "edit" ? modal.season : undefined}
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
