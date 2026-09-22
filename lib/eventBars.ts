import { differenceInCalendarDays, isAfter, isBefore, max, min } from "date-fns";
import { parseDateStr, toDateStr } from "./dates";
import { occurrenceKey } from "./occurrenceKey";
import { EventOccurrence } from "./types";

export interface EventBarSegment {
  occurrence: EventOccurrence;
  weekIndex: number;
  laneIndex: number; // global lane — stable across weeks, see assignEventLanes
  startCol: number; // 0–6, day-of-week column within this week
  endCol: number; // 0–6
  isSpanStart: boolean;
  isSpanEnd: boolean;
}

interface ClippedInterval {
  occurrence: EventOccurrence;
  startOffset: number; // days from gridStart
  endOffset: number; // days from gridStart
}

function multiDayOnly(occurrences: EventOccurrence[]): EventOccurrence[] {
  return occurrences.filter((occ) => occ.spanEndDate !== occ.occurrenceDate);
}

function clipToGrid(occurrences: EventOccurrence[], gridStart: Date, gridEnd: Date): ClippedInterval[] {
  const intervals: ClippedInterval[] = [];
  for (const occurrence of occurrences) {
    const start = parseDateStr(occurrence.occurrenceDate);
    const end = parseDateStr(occurrence.spanEndDate);
    if (isAfter(start, gridEnd) || isBefore(end, gridStart)) continue;

    const clippedStart = max([start, gridStart]);
    const clippedEnd = min([end, gridEnd]);
    intervals.push({
      occurrence,
      startOffset: differenceInCalendarDays(clippedStart, gridStart),
      endOffset: differenceInCalendarDays(clippedEnd, gridStart),
    });
  }
  return intervals;
}

// Same greedy interval-partitioning approach as lib/seasonBars.ts — see that
// file's comment for the full rationale (computed once over the whole grid
// so a bar keeps the same lane across every week it spans).
export function assignEventLanes(
  occurrences: EventOccurrence[],
  gridStart: Date,
  gridEnd: Date
): Map<string, number> {
  const intervals = clipToGrid(multiDayOnly(occurrences), gridStart, gridEnd);

  intervals.sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    const aDuration = a.endOffset - a.startOffset;
    const bDuration = b.endOffset - b.startOffset;
    if (aDuration !== bDuration) return bDuration - aDuration; // longer first
    return occurrenceKey(a.occurrence).localeCompare(occurrenceKey(b.occurrence)); // deterministic tie-break
  });

  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const interval of intervals) {
    let assigned = laneEnds.findIndex((end) => end < interval.startOffset);
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(interval.endOffset);
    } else {
      laneEnds[assigned] = interval.endOffset;
    }
    lanes.set(occurrenceKey(interval.occurrence), assigned);
  }

  return lanes;
}

// Computes, for each week in the grid, the bar segment(s) that fall in it —
// only for occurrences spanning more than one day; single-day occurrences
// keep rendering as ordinary day-cell cards (see lib/dayIndex.ts).
export function computeEventBarSegments(
  occurrences: EventOccurrence[],
  weeks: Date[][],
  gridStart: Date,
  gridEnd: Date
): EventBarSegment[][] {
  const multiDay = multiDayOnly(occurrences);
  const lanes = assignEventLanes(occurrences, gridStart, gridEnd);

  return weeks.map((week, weekIndex) => {
    const weekStart = week[0];
    const weekEnd = week[6];
    const segments: EventBarSegment[] = [];

    for (const occurrence of multiDay) {
      const start = parseDateStr(occurrence.occurrenceDate);
      const end = parseDateStr(occurrence.spanEndDate);
      if (isAfter(start, weekEnd) || isBefore(end, weekStart)) continue;

      const clippedStart = max([start, weekStart]);
      const clippedEnd = min([end, weekEnd]);

      segments.push({
        occurrence,
        weekIndex,
        laneIndex: lanes.get(occurrenceKey(occurrence)) ?? 0,
        startCol: differenceInCalendarDays(clippedStart, weekStart),
        endCol: differenceInCalendarDays(clippedEnd, weekStart),
        isSpanStart: toDateStr(clippedStart) === occurrence.occurrenceDate,
        isSpanEnd: toDateStr(clippedEnd) === occurrence.spanEndDate,
      });
    }

    return segments;
  });
}
