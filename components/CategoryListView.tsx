"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EventModal from "./EventModal";
import { EventOccurrence, LevelRow } from "@/lib/types";
import { LEVEL_CHIP_CLASSES } from "@/lib/constants";
import Pill from "./ui/Pill";
import Button from "./ui/Button";
import { ChevronIcon, PlusIcon } from "./icons";
import { resolveLevelColor } from "@/lib/levelColor";
import { formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import { useEventFilter } from "@/lib/eventFilterContext";
import { useIsEditor } from "@/lib/roleContext";

interface CategoryListViewProps {
  occurrences: EventOccurrence[];
  levels: LevelRow[];
  // Date a new event defaults to when added from here (the list has no
  // day-cell to click, unlike the calendar) — the 1st of the viewed month.
  defaultAddDate: string;
}

type ModalState = { type: "closed" } | { type: "add" } | { type: "edit"; occurrence: EventOccurrence };

// A per-category breakdown of the same occurrences already shown on the
// calendar grid for this month — lets a zone leader (Youth, Poly, Uni,
// Adults, ...) scan and manage just their own events without hunting across
// the grid. Add/edit/delete reuse the exact same EventModal as the calendar,
// including the recurring-series scope prompt.
export default function CategoryListView({ occurrences, levels, defaultAddDate }: CategoryListViewProps) {
  const router = useRouter();
  const { isVisible } = useEventFilter();
  const isEditor = useIsEditor();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(levels.map((l) => l.name)));
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  const grouped = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>();
    for (const level of levels) {
      if (isVisible(level.name)) map.set(level.name, []);
    }
    for (const occ of occurrences) {
      if (!isVisible(occ.event.level)) continue;
      const existing = map.get(occ.event.level);
      if (existing) {
        existing.push(occ);
      } else {
        // Defensive: an event whose category was renamed/deleted out from
        // under it still needs somewhere to show up, not to vanish silently.
        map.set(occ.event.level, [occ]);
      }
    }
    for (const list of Array.from(map.values())) {
      list.sort(
        (a, b) =>
          a.occurrenceDate.localeCompare(b.occurrenceDate) ||
          (a.startTime ?? "").localeCompare(b.startTime ?? "")
      );
    }
    return map;
  }, [occurrences, levels, isVisible]);

  function toggle(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-title text-navy">Events by category</h2>
        {isEditor && (
          <Button size="sm" icon={<PlusIcon />} onClick={() => setModal({ type: "add" })}>
            Add event
          </Button>
        )}
      </div>
      {Array.from(grouped.entries()).map(([name, occs]) => {
        const level = levels.find((l) => l.name === name);
        const isCollapsed = collapsed.has(name);
        const colorClass = LEVEL_CHIP_CLASSES[
          level ? resolveLevelColor(level) : resolveLevelColor({ name, color_key: null })
        ];

        return (
          <div key={name} className="bg-surface rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(name)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-fill text-ui font-semibold text-navy transition-colors duration-fast"
            >
              <span className="flex items-center gap-2">
                <span className={["text-chip font-medium rounded-chip pl-1.5 pr-2 py-0.5", colorClass].join(" ")}>
                  {name}
                </span>
                <Pill>{occs.length}</Pill>
              </span>
              <span className="text-ink-3"><ChevronIcon open={!isCollapsed} /></span>
            </button>
            {!isCollapsed && (
              <ul className="divide-y divide-line border-t border-line">
                {occs.length === 0 && (
                  <li className="px-4 py-2 text-body text-ink-2">No events this month.</li>
                )}
                {occs.map((occ) => {
                  // Same Series — Sermon Title subtitle shown on the calendar's
                  // Gathering cards (EventCardContent/DayViewEventContent) —
                  // repeated here so a zone leader scanning this list doesn't
                  // have to open each Gathering to see what it's about.
                  const subtitle =
                    occ.event.event_type === "Gathering"
                      ? [occ.event.series, occ.event.sermon_title].filter(Boolean).join(" — ")
                      : "";
                  return (
                    <li key={`${occ.event.id}-${occ.occurrenceDate}`}>
                      <button
                        type="button"
                        onClick={() => setModal({ type: "edit", occurrence: occ })}
                        className="w-full px-4 py-2 text-body flex items-center justify-between gap-3 text-left hover:bg-canvas"
                      >
                        <span className="min-w-0 flex flex-col">
                          <span className="truncate">{occ.event.name}</span>
                          {subtitle && (
                            <span className="truncate text-micro text-ink-2">{subtitle}</span>
                          )}
                        </span>
                        <span className="text-ink-2 whitespace-nowrap text-micro">
                          {formatDateDisplay(occ.occurrenceDate)}
                          {formatEventTimeRange(occ.startTime, occ.endTime)
                            ? ` · ${formatEventTimeRange(occ.startTime, occ.endTime)}`
                            : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {modal.type !== "closed" && (
        <EventModal
          mode={modal.type}
          initialDate={modal.type === "add" ? defaultAddDate : undefined}
          event={modal.type === "edit" ? modal.occurrence.event : undefined}
          occurrence={modal.type === "edit" ? modal.occurrence : undefined}
          levels={levels}
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
