// Shared aggregation math for the Seasons "Update Calendar" / "Start a New
// Year" flows — turns a group's per-institution entered dates into the
// single Season row's proposed start/end (earliest start, latest end across
// whichever institutions have been filled in so far).

export interface SourceDateEntry {
  start_date: string | null;
  end_date: string | null;
}

export interface GroupAggregate {
  startDate: string | null;
  endDate: string | null;
  filledCount: number;
  total: number;
}

export function computeGroupAggregate(entries: SourceDateEntry[]): GroupAggregate {
  let startDate: string | null = null;
  let endDate: string | null = null;
  let filledCount = 0;

  for (const entry of entries) {
    if (entry.start_date || entry.end_date) filledCount++;
    if (entry.start_date && (!startDate || entry.start_date < startDate)) {
      startDate = entry.start_date;
    }
    if (entry.end_date && (!endDate || entry.end_date > endDate)) {
      endDate = entry.end_date;
    }
  }

  return { startDate, endDate, filledCount, total: entries.length };
}
