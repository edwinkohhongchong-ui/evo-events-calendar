"use client";

import { useMemo, useState, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import SeasonModal from "./SeasonModal";
import { deleteSeason } from "@/lib/seasonActions";
import { SeasonRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; season: SeasonRow };

const ALL_YEARS = "All";

export default function SeasonsTable({ seasons }: { seasons: SeasonRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(e: MouseEvent, season: SeasonRow) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${season.name}"?`)) return;
    setRemovingId(season.id);
    try {
      await deleteSeason(season.id);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong deleting this season.");
    } finally {
      setRemovingId(null);
    }
  }

  // A season can span a year boundary (e.g. "RF 2025/2026" runs Dec–Feb) —
  // the year list/filter is based on which years a season touches at all,
  // not just the year it starts in, so selecting 2026 still surfaces it.
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const season of seasons) {
      set.add(season.start_date.slice(0, 4));
      set.add(season.end_date.slice(0, 4));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [seasons]);

  const filtered = useMemo(() => {
    if (yearFilter === ALL_YEARS) return seasons;
    return seasons.filter(
      (s) => s.start_date.slice(0, 4) <= yearFilter && s.end_date.slice(0, 4) >= yearFilter
    );
  }, [seasons, yearFilter]);

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
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((season) => (
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
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => handleRemove(e, season)}
                    disabled={removingId === season.id}
                    title={`Remove "${season.name}"`}
                    className="text-gray-300 hover:text-red-600 disabled:opacity-30 leading-none"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  No seasons{yearFilter !== ALL_YEARS ? ` for ${yearFilter}` : " yet"}.
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
