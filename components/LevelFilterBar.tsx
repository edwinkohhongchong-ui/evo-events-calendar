"use client";

import { LEVEL_COLOR_CLASSES } from "@/lib/constants";
import { resolveLevelColor } from "@/lib/levelColor";
import { useEventFilter } from "@/lib/eventFilterContext";
import { LevelRow } from "@/lib/types";

interface LevelFilterBarProps {
  levels: LevelRow[];
}

// Click a category chip to isolate it (show only that category); click it
// again to add it back. Chips not currently visible are dimmed rather than
// removed, so the full category list stays in view while filtering.
export default function LevelFilterBar({ levels }: LevelFilterBarProps) {
  const { activeLevels, isVisible, toggleLevel, showAll } = useEventFilter();
  const allNames = levels.map((l) => l.name);

  if (levels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[11px] text-gray-400">Filter:</span>
      {levels.map((level) => {
        const visible = isVisible(level.name);
        return (
          <button
            key={level.id}
            type="button"
            onClick={() => toggleLevel(level.name, allNames)}
            title={visible ? `Hide "${level.name}"` : `Show "${level.name}"`}
            className={[
              "text-[11px] px-1.5 py-0.5 rounded border",
              LEVEL_COLOR_CLASSES[resolveLevelColor(level)],
              visible ? "" : "opacity-30",
            ].join(" ")}
          >
            {level.name}
          </button>
        );
      })}
      {activeLevels && (
        <button type="button" onClick={showAll} className="text-[11px] text-navy hover:underline">
          Show all
        </button>
      )}
    </div>
  );
}
