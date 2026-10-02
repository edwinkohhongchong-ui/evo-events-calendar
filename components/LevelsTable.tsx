"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LevelModal from "./LevelModal";
import { LevelRow } from "@/lib/types";
import { chipStyle, dotStyle } from "@/lib/colorStyle";
import { resolveLevelColor } from "@/lib/levelColor";
import { TABLE_CARD, TABLE, TH, TD, TR, EMPTY_CELL } from "./ui/tableStyles";
import Button from "./ui/Button";
import { PlusIcon } from "./icons";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; level: LevelRow };

export default function LevelsTable({ levels }: { levels: LevelRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const nextSortOrder = levels.length > 0 ? Math.max(...levels.map((l) => l.sort_order)) + 1 : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-2">
          These are the event categories shown in the calendar legend, the Add Event form, and the
          list below the calendar.
        </p>
        <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} onClick={() => setModal({ type: "add" })}>
          Add Category
        </Button>
      </div>
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Colour</th>
              <th className={TH}>Order</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => {
              const color = resolveLevelColor(level);
              const chip = chipStyle(color);
              const dot = dotStyle(color);
              return (
                <tr key={level.id} onClick={() => setModal({ type: "edit", level })} className={TR}>
                  <td className={TD}>
                    <span
                      className={["inline-block rounded-chip px-2 py-0.5 text-chip font-medium", chip.className].join(" ")}
                      style={chip.style}
                    >
                      {level.name}
                    </span>
                  </td>
                  <td className={TD}>
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full ${dot.className}`}
                      style={dot.style}
                      title={color}
                      aria-label={color}
                    />
                  </td>
                  <td className={`${TD} text-ink-2`}>{level.sort_order}</td>
                </tr>
              );
            })}
            {levels.length === 0 && (
              <tr>
                <td colSpan={3} className={EMPTY_CELL}>
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
