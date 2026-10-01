"use client";

import { useMemo, useState, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SeasonModal from "./SeasonModal";
import ConfirmModal from "./ConfirmModal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { deleteSeason } from "@/lib/seasonActions";
import { useUndo } from "@/lib/undo/UndoProvider";
import { SeasonRow } from "@/lib/types";
import { formatDateDisplay } from "@/lib/dates";
import { unwrap } from "@/lib/actionResult";
import { TABLE_CARD, TABLE, TH, TD, TR, EMPTY_CELL, ROW_ACTION, TOOLBAR_SELECT } from "./ui/tableStyles";
import Button, { buttonClass } from "./ui/Button";
import IconButton from "./ui/IconButton";
import Pill from "./ui/Pill";
import { PlusIcon, TrashIcon, CheckCircleIcon } from "./icons";
import { LEVEL_DOT_CLASSES } from "@/lib/constants";
import { resolveSeasonColor } from "@/lib/seasonColor";

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; season: SeasonRow };

const ALL_YEARS = "All";

export default function SeasonsTable({ seasons }: { seasons: SeasonRow[] }) {
  const router = useRouter();
  const { record } = useUndo();
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEARS);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SeasonRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEscapeKey(() => setPendingDelete(null));

  function handleRemove(e: MouseEvent, season: SeasonRow) {
    e.stopPropagation();
    setDeleteError(null);
    setPendingDelete(season);
  }

  async function handleConfirmRemove() {
    if (!pendingDelete) return;
    const season = pendingDelete;
    setRemovingId(season.id);
    try {
      const affected = unwrap(await deleteSeason(season.id));
      record(`Delete season "${season.name}"`, affected);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong deleting this season."
      );
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
            href="/seasons/update-calendar"
            className={buttonClass("secondary", "sm")}
            title="Manually enter this year's exam/term dates for each institution — there's no API for these, so this is an entry assist, not a live fetch"
          >
            Update Calendar
          </Link>
          <Link href="/seasons/new-year" className={buttonClass("secondary", "sm")}>
            Start a New Year
          </Link>
          <Button size="sm" icon={<PlusIcon className="!h-4 !w-4" />} onClick={() => setModal({ type: "add" })}>
            Add Season
          </Button>
        </div>
      </div>
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>Category</th>
              <th className={TH}>Dates</th>
              <th className={TH}>Notes</th>
              <th className={`${TH} w-12`}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((season) => (
              <tr key={season.id} onClick={() => setModal({ type: "edit", season })} className={TR}>
                <td className={`${TD} font-medium`}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT_CLASSES[resolveSeasonColor(season)]}`}
                      aria-hidden="true"
                    />
                    {season.name}
                  </span>
                </td>
                <td className={`${TD} text-ink-2`}>{season.category}</td>
                <td className={TD}>
                  {formatDateDisplay(season.start_date)} – {formatDateDisplay(season.end_date)}
                </td>
                <td className={`${TD} max-w-[200px] truncate text-ink-2`}>{season.notes}</td>
                <td className={`${TD} text-right`}>
                  <span className={ROW_ACTION}>
                    <IconButton
                      label={`Remove "${season.name}"`}
                      icon={<TrashIcon className="!h-4 !w-4" />}
                      onClick={(e) => handleRemove(e, season)}
                      disabled={removingId === season.id}
                      className="hover:!text-danger"
                    />
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className={EMPTY_CELL}>
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
