import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  format,
} from "date-fns";
import { isValidDateStr, MAX_YEAR, MIN_YEAR, parseDateStr, toDateStr } from "./dates";
import { nthOccurrence } from "./recurrence";
import { EventOccurrence, EventRow, ExceptionRow, OverrideRow, Recurring } from "./types";

// Dragging an occurrence of a recurring event asks "only this event, or all
// events in the series". "All events" shifts the whole series by the dragged
// day delta (see shiftSeriesImpl in lib/actions.ts). Pure helpers live here so
// the date logic is unit-tested without Supabase.

/** A non-recurring event moves straight away; a recurring one asks first. */
export function needsDragScopePrompt(event: Pick<EventRow, "recurring">): boolean {
  return event.recurring !== "None";
}

/** Days the card travelled, measured from where it is shown (post-override). */
export function dragDelta(occurrence: Pick<EventOccurrence, "occurrenceDate">, targetDate: string): number {
  return differenceInCalendarDays(parseDateStr(targetDate), parseDateStr(occurrence.occurrenceDate));
}

export function shiftDate(date: string, delta: number): string {
  return toDateStr(addDays(parseDateStr(date), delta));
}

/** The events-row columns that move with the series (end_date and repeat_until only when set). */
export function shiftSeriesFields(
  event: Pick<EventRow, "event_date" | "end_date" | "repeat_until">,
  delta: number
): { event_date: string; end_date: string | null; repeat_until: string | null } {
  return {
    event_date: shiftDate(event.event_date, delta),
    end_date: event.end_date ? shiftDate(event.end_date, delta) : null,
    repeat_until: event.repeat_until ? shiftDate(event.repeat_until, delta) : null,
  };
}

/** n when `date` is the series' nth natural occurrence from `anchor`, else null (a stale key). */
export function occurrenceIndex(anchor: string, recurring: Recurring, date: string): number | null {
  const a = parseDateStr(anchor);
  const d = parseDateStr(date);
  let n: number;
  switch (recurring) {
    case "Weekly": {
      const days = differenceInCalendarDays(d, a);
      if (days < 0 || days % 7 !== 0) return null;
      n = days / 7;
      break;
    }
    case "Monthly":
      n = differenceInCalendarMonths(d, a);
      break;
    case "Yearly":
      n = differenceInCalendarYears(d, a);
      break;
    default:
      return null;
  }
  if (n < 0) return null;
  return toDateStr(nthOccurrence(a, recurring, n)) === date ? n : null;
}

// Where an override/exception key (an original_date) lands after the series
// anchor moves. A key that is a real occurrence follows its occurrence number,
// so month-end clamping stays right (a Mar 31 key follows its occurrence to
// the new anchor's own clamped date, not to "31 + delta days"). A stale key
// that no longer matches the series just shifts by the delta.
function mapKey(oldKey: string, oldAnchor: string, newAnchor: string, recurring: Recurring, delta: number): string {
  const n = occurrenceIndex(oldAnchor, recurring, oldKey);
  return n === null ? shiftDate(oldKey, delta) : toDateStr(nthOccurrence(parseDateStr(newAnchor), recurring, n));
}

export const SERIES_SHIFT_COLLISION_MESSAGE =
  "This series has individual changes (moved, retimed or removed dates) that would overlap if every event moved by that many days. Nothing was changed. Move the single dates one at a time, or edit the series instead.";
export const SERIES_SHIFT_RANGE_MESSAGE = `A series can only be moved within ${MIN_YEAR}–${MAX_YEAR}. Nothing was changed.`;

export interface OverrideShift {
  id: string;
  patch: { original_date: string; new_date: string; new_end_date?: string | null };
}
export interface ExceptionShift {
  id: string;
  patch: { original_date: string };
}
export type SeriesShiftPlan =
  | {
      ok: true;
      patch: ReturnType<typeof shiftSeriesFields>;
      overrides: OverrideShift[];
      exceptions: ExceptionShift[];
    }
  | { ok: false; error: string };

// Per-occurrence rows that would land on a key another row in the same table
// still holds. Updating them one at a time (and Undo/Redo, which replays rows
// one at a time) could hit the (event_id, original_date) unique constraint
// depending on order, so such a shift is refused instead of attempted.
function collides(moves: Array<{ from: string; to: string }>): boolean {
  const olds = new Set(moves.map((m) => m.from));
  const news = new Set<string>();
  for (const m of moves) {
    if (news.has(m.to)) return true;
    news.add(m.to);
    if (m.to !== m.from && olds.has(m.to)) return true;
  }
  return false;
}

/**
 * Plan for shifting a whole series by `delta` days: the new events-row dates
 * plus the matching key moves for every override and exception, so they still
 * line up with the shifted occurrences. An override keeps its offset from its
 * key (a Mar 16 occurrence dragged to Mar 17 stays one day later after the
 * shift), including a resized end date. Time overrides are untouched.
 */
export function planSeriesShift(
  event: Pick<EventRow, "event_date" | "end_date" | "repeat_until" | "recurring">,
  overrides: Pick<OverrideRow, "id" | "original_date" | "new_date" | "new_end_date">[],
  exceptions: Pick<ExceptionRow, "id" | "original_date">[],
  delta: number
): SeriesShiftPlan {
  if (event.recurring === "None") return { ok: false, error: "This event does not repeat." };
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "That doesn't move the event to a different day." };
  // ~100 years: anything bigger can't land in the supported range anyway, and a huge
  // value would make the date maths throw an unfriendly error.
  if (Math.abs(delta) > 36600) return { ok: false, error: SERIES_SHIFT_RANGE_MESSAGE };

  const patch = shiftSeriesFields(event, delta);
  const inRange = [patch.event_date, patch.end_date, patch.repeat_until].every(
    (d) => d === null || (isValidDateStr(d) && Number(d.slice(0, 4)) >= MIN_YEAR && Number(d.slice(0, 4)) <= MAX_YEAR)
  );
  if (!inRange) return { ok: false, error: SERIES_SHIFT_RANGE_MESSAGE };

  const key = (k: string) => mapKey(k, event.event_date, patch.event_date, event.recurring, delta);

  const overridePlans = overrides.map((o) => {
    const to = key(o.original_date);
    const offset = (d: string) => shiftDate(to, differenceInCalendarDays(parseDateStr(d), parseDateStr(o.original_date)));
    const patch: OverrideShift["patch"] = { original_date: to, new_date: offset(o.new_date) };
    if (o.new_end_date) patch.new_end_date = offset(o.new_end_date);
    const changed =
      to !== o.original_date || patch.new_date !== o.new_date || (o.new_end_date != null && patch.new_end_date !== o.new_end_date);
    return { from: o.original_date, to, changed, shift: { id: o.id, patch } };
  });
  const exceptionPlans = exceptions.map((x) => {
    const to = key(x.original_date);
    return { from: x.original_date, to, changed: to !== x.original_date, shift: { id: x.id, patch: { original_date: to } } };
  });

  if (collides(overridePlans) || collides(exceptionPlans)) return { ok: false, error: SERIES_SHIFT_COLLISION_MESSAGE };

  // Re-keyed override dates must stay in the supported years too.
  const yearOk = (d: string | null | undefined) =>
    d == null || (isValidDateStr(d) && Number(d.slice(0, 4)) >= MIN_YEAR && Number(d.slice(0, 4)) <= MAX_YEAR);
  for (const p of overridePlans) {
    const ps = p.shift.patch;
    if (!yearOk(ps.original_date) || !yearOk(ps.new_date) || !yearOk(ps.new_end_date)) {
      return { ok: false, error: SERIES_SHIFT_RANGE_MESSAGE };
    }
  }
  for (const p of exceptionPlans) {
    if (!yearOk(p.shift.patch.original_date)) return { ok: false, error: SERIES_SHIFT_RANGE_MESSAGE };
  }

  return {
    ok: true,
    patch,
    overrides: overridePlans.filter((p) => p.changed).map((p) => p.shift),
    exceptions: exceptionPlans.filter((p) => p.changed).map((p) => p.shift),
  };
}

/** Dialog copy for the "All events in the series" option. */
export function seriesShiftDescription(event: Pick<EventRow, "event_date" | "recurring">, delta: number): string {
  const n = Math.abs(delta);
  const dir = delta > 0 ? "later" : "earlier";
  const head = `Moves every event in the series ${n} day${n === 1 ? "" : "s"} ${dir}.`;
  const newStart = parseDateStr(shiftDate(event.event_date, delta));
  if (event.recurring === "Weekly") return `${head} It will repeat every ${format(newStart, "EEEE")}.`;
  if (event.recurring === "Monthly") return `${head} The series restarts on the ${format(newStart, "do")} of each month.`;
  return `${head} The series restarts on ${format(newStart, "MMMM d")} each year.`;
}
