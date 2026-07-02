import { SeasonSegment } from "@/lib/seasonBars";
import { resolveSeasonColor } from "@/lib/seasonColor";
import { SEASON_BAR_COLORS } from "@/lib/constants";

// Renders one week's season bars as a 7-column CSS Grid aligned with the
// day-cell row below it — no pixel measurement needed, grid-column/grid-row
// placement keeps the bars lined up with their days regardless of viewport
// width. Lanes with no active segment this week are left as blank implicit
// rows (via gridAutoRows) rather than compacted, so a season occupying a
// lower lane doesn't visually jump up in weeks where a higher lane is empty.
export default function SeasonBarRow({ segments }: { segments: SeasonSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <div className="grid grid-cols-7" style={{ gridAutoRows: "18px" }}>
      {segments.map((segment) => {
        const colorKey = resolveSeasonColor(segment.season);
        return (
          <div
            key={`${segment.season.id}-w${segment.weekIndex}`}
            className={[
              "text-[10px] leading-[18px] px-1.5 truncate border",
              SEASON_BAR_COLORS[colorKey],
              segment.isSeasonStart ? "rounded-l-full" : "border-l-0",
              segment.isSeasonEnd ? "rounded-r-full" : "border-r-0",
            ].join(" ")}
            style={{
              gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
              gridRow: segment.laneIndex + 1,
            }}
            title={segment.season.name}
          >
            {segment.isSeasonStart ? segment.season.name : " "}
          </div>
        );
      })}
    </div>
  );
}
