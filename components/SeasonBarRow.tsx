import { SeasonSegment } from "@/lib/seasonBars";
import { resolveSeasonColor } from "@/lib/seasonColor";
import { seasonBarStyle } from "@/lib/colorStyle";
import { SeasonRow } from "@/lib/types";
import { useSeasonPreview } from "./InfoPreviewCard";

interface SeasonBarRowProps {
  segments: SeasonSegment[];
  onSeasonClick: (season: SeasonRow) => void;
}

// Renders one week's season bars as a 7-column CSS Grid aligned with the
// day-cell row below it — no pixel measurement needed, grid-column/grid-row
// placement keeps the bars lined up with their days regardless of viewport
// width. Lanes with no active segment this week are left as blank implicit
// rows (via gridAutoRows) rather than compacted, so a season occupying a
// lower lane doesn't visually jump up in weeks where a higher lane is empty.
export default function SeasonBarRow({ segments, onSeasonClick }: SeasonBarRowProps) {
  if (segments.length === 0) return null;

  return (
    <div className="print-season-row grid grid-cols-7" style={{ gridAutoRows: "18px" }}>
      {segments.map((segment) => (
        <SeasonBar key={`${segment.season.id}-w${segment.weekIndex}`} segment={segment} onSeasonClick={onSeasonClick} />
      ))}
    </div>
  );
}

function SeasonBar({ segment, onSeasonClick }: { segment: SeasonSegment; onSeasonClick: (season: SeasonRow) => void }) {
  const bar = seasonBarStyle(resolveSeasonColor(segment.season));
  const { bind, card, hide } = useSeasonPreview(segment.season);
  return (
    <>
      <button
        type="button"
        data-season-id={segment.season.id}
        {...bind}
        onClick={(e) => {
          e.stopPropagation();
          hide();
          onSeasonClick(segment.season);
        }}
        className={[
          "text-micro leading-[18px] px-1.5 truncate border text-left hover:brightness-95",
          bar.className,
          segment.isSeasonStart ? "rounded-l-full" : "border-l-0",
          segment.isSeasonEnd ? "rounded-r-full" : "border-r-0",
        ].join(" ")}
        style={{
          ...bar.style,
          gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
          gridRow: segment.laneIndex + 1,
        }}
        aria-label={segment.season.name}
      >
        {/* Repeats the name at the start of every week this bar crosses
            (startCol 0 = Monday), not just the season's true start. Non-breaking
            space on the empty-label branch so the bar keeps its row height. */}
        {segment.isSeasonStart || segment.startCol === 0 ? segment.season.name : "\u00a0"}
      </button>
      {card}
    </>
  );
}
