import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from "date-fns";

export interface MonthGrid {
  monthStart: Date;
  monthEnd: Date;
  gridStart: Date;
  gridEnd: Date;
  weeks: Date[][];
}

// Builds a Monday-start month grid, including the leading/trailing days from
// the adjacent months needed to fill out full weeks.
export function getMonthGrid(year: number, month: number): MonthGrid {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  return { monthStart, monthEnd, gridStart, gridEnd, weeks };
}
