"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LevelModal from "./LevelModal";
import { LevelRow } from "@/lib/types";
import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { resolveLevelColor } from "@/lib/levelColor";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; level: LevelRow };

export default function LevelsTable({ levels }: { levels: LevelRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const nextSortOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          These are the event categories shown in the calendar legend, the Add Event form, and the
          list below the calendar.
        </p>
        <button
          onClick={() => setModal({ type: "add" })}
          className="px-3 py-1.5 text-sm rounded bg-navy text-white whitespace-nowrap"
        >
          Add Category
        </button>
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-navy text-white text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Color</th>
              <th className="px-3 py-2">Order</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr
                key={level.id}
                onClick={() => setModal({ type: "edit", level })}
                className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-2">
                  <span
                    className={[
                      "text-[11px] px-1.5 py-0.5 rounded border",
                      LEVEL_COLOR_CLASSES[resolveLevelColor(level)],
                    ].join(" ")}
                  >
                    {level.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{resolveLevelColor(level)}</td>
                <td className="px-3 py-2 text-gray-600">{level.sort_order}</td>
              </tr>
            ))}
            {levels.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.type !== "closed" && (
        <LevelModal
          mode={modal.type}
          level={modal.type === "edit" ? modal.level : undefined}
          nextSortOrder={nextSortOrder}
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
