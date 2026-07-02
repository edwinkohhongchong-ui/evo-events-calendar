import { differenceInCalendarDays, isAfter, isBefore, max, min } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { SeasonRow } from "./types";

export interface SeasonSegment {
  season: SeasonRow;
  weekIndex: number;
  laneIndex: number; // global lane — stable across weeks, see assignSeasonLanes
  startCol: number; // 0–6, day-of-week column within this week
  endCol: number; // 0–6
  isSeasonStart: boolean; // true only on the segment containing the real start_date
  isSeasonEnd: boolean; // true only on the segment containing the real end_date
}

interface ClippedInterval {
  season: SeasonRow;
  startOffset: number; // days from gridStart
  endOffset: number; // days from gridStart
}

function clipToGrid(seasons: SeasonRow[], gridStart: Date, gridEnd: Date): ClippedInterval[] {
  const intervals: ClippedInterval[] = [];
  for (const season of seasons) {
    const seasonStart = parseDateStr(season.start_date);
    const seasonEnd = parseDateStr(season.end_date);
    if (isAfter(seasonStart, gridEnd) || isBefore(seasonEnd, gridStart)) continue;

    const clippedStart = max([seasonStart, gridStart]);
    const clippedEnd = min([seasonEnd, gridEnd]);
    intervals.push({
      season,
      startOffset: differenceInCalendarDays(clippedStart, gridStart),
      endOffset: differenceInCalendarDays(clippedEnd, gridStart),
    });
  }
  return intervals;
}

// Greedy interval partitioning, computed once over the whole visible grid so
// a season keeps the same lane in every week it appears in — recomputing per
// week independently would let a season's bar jump rows depending on what
// else happens to be visible that particular week.
//
// Lanes are packed left-to-right: each season goes in the first lane whose
// current occupant ends strictly before this season starts (same-day
// touching counts as overlapping — both would render on that shared day).
// This is the standard minimum-lane algorithm, and it correctly reuses a
// lane freed up by an earlier season for a later non-overlapping one instead
// of always opening a new lane.
export function assignSeasonLanes(
  seasons: SeasonRow[],
  gridStart: Date,
  gridEnd: Date
): Map<string, number> {
  const intervals = clipToGrid(seasons, gridStart, gridEnd);

  intervals.sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    const aDuration = a.endOffset - a.startOffset;
    const bDuration = b.endOffset - b.startOffset;
    if (aDuration !== bDuration) return bDuration - aDuration; // longer first
    return a.season.id.localeCompare(b.season.id); // deterministic tie-break
  });

  const laneEnds: number[] = []; // laneEnds[i] = endOffset of that lane's current occupant
  const lanes = new Map<string, number>();

  for (const interval of intervals) {
    let assigned = laneEnds.findIndex((end) => end < interval.startOffset);
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(interval.endOffset);
    } else {
      laneEnds[assigned] = interval.endOffset;
    }
    lanes.set(interval.season.id, assigned);
  }

  return lanes;
}

// Computes, for each week in the grid, the bar segment(s) that fall in it.
// A season spanning multiple weeks produces multiple segments — one per
// week — sharing the same laneIndex but each with its own startCol/endCol
// clipped to that week, and isSeasonStart/isSeasonEnd true on at most one
// segment each (the ones containing the real start_date/end_date).
export function computeSeasonSegments(
  seasons: SeasonRow[],
  weeks: Date[][],
  gridStart: Date,
  gridEnd: Date
): SeasonSegment[][] {
  const lanes = assignSeasonLanes(seasons, gridStart, gridEnd);

  return weeks.map((week, weekIndex) => {
    const weekStart = week[0];
    const weekEnd = week[6];
    const segments: SeasonSegment[] = [];

    for (const season of seasons) {
      const seasonStart = parseDateStr(season.start_date);
      const seasonEnd = parseDateStr(season.end_date);
      if (isAfter(seasonStart, weekEnd) || isBefore(seasonEnd, weekStart)) continue;

      const clippedStart = max([seasonStart, weekStart]);
      const clippedEnd = min([seasonEnd, weekEnd]);

      segments.push({
        season,
        weekIndex,
        laneIndex: lanes.get(season.id) ?? 0,
        startCol: differenceInCalendarDays(clippedStart, weekStart),
        endCol: differenceInCalendarDays(clippedEnd, weekStart),
        isSeasonStart: toDateStr(clippedStart) === season.start_date,
        isSeasonEnd: toDateStr(clippedEnd) === season.end_date,
      });
    }

    return segments;
  });
}
