import { describe, expect, it } from "vitest";
import { makeEvent, makeOcc } from "./fixtures";
import {
  SERIES_SHIFT_COLLISION_MESSAGE,
  SERIES_SHIFT_RANGE_MESSAGE,
  dragDelta,
  needsDragScopePrompt,
  occurrenceIndex,
  planSeriesShift,
  seriesShiftDescription,
  shiftSeriesFields,
} from "../seriesShift";

const ov = (id: string, original_date: string, new_date: string, new_end_date: string | null = null) => ({
  id,
  original_date,
  new_date,
  new_end_date,
});
const ex = (id: string, original_date: string) => ({ id, original_date });

describe("drag scope decision", () => {
  it("moves a one-off event straight away and asks for every repeat pattern", () => {
    expect(needsDragScopePrompt({ recurring: "None" })).toBe(false);
    for (const recurring of ["Weekly", "Monthly", "Yearly"] as const) expect(needsDragScopePrompt({ recurring })).toBe(true);
  });

  it("measures the delta from where the card is shown, not its natural date", () => {
    const ev = makeEvent({ event_date: "2026-03-02", recurring: "Weekly" });
    const occ = { ...makeOcc(ev, "2026-03-09"), occurrenceDate: "2026-03-10" }; // already moved a day
    expect(dragDelta(occ, "2026-03-12")).toBe(2);
    expect(dragDelta(occ, "2026-03-08")).toBe(-2);
  });
});

describe("shiftSeriesFields", () => {
  it("moves start, end and repeat-until by the same delta", () => {
    expect(shiftSeriesFields({ event_date: "2026-03-02", end_date: "2026-03-04", repeat_until: "2026-12-28" }, 2)).toEqual({
      event_date: "2026-03-04",
      end_date: "2026-03-06",
      repeat_until: "2026-12-30",
    });
  });

  it("leaves unset end_date and repeat_until null", () => {
    expect(shiftSeriesFields({ event_date: "2026-03-02", end_date: null, repeat_until: null }, -3)).toEqual({
      event_date: "2026-02-27",
      end_date: null,
      repeat_until: null,
    });
  });
});

describe("occurrenceIndex", () => {
  it("finds weekly, monthly (clamped) and yearly (leap) occurrence numbers", () => {
    expect(occurrenceIndex("2026-03-02", "Weekly", "2026-03-16")).toBe(2);
    expect(occurrenceIndex("2026-03-02", "Weekly", "2026-03-10")).toBeNull();
    expect(occurrenceIndex("2026-01-31", "Monthly", "2026-02-28")).toBe(1);
    expect(occurrenceIndex("2026-01-31", "Monthly", "2026-02-27")).toBeNull();
    expect(occurrenceIndex("2024-02-29", "Yearly", "2025-02-28")).toBe(1);
    expect(occurrenceIndex("2024-02-29", "Yearly", "2028-02-29")).toBe(4);
    expect(occurrenceIndex("2026-03-02", "Weekly", "2026-02-23")).toBeNull(); // before the anchor
  });
});

describe("planSeriesShift", () => {
  const weekly = makeEvent({ event_date: "2026-03-02", repeat_until: "2026-06-01", recurring: "Weekly" });

  it("re-keys weekly exceptions by the delta so they still line up", () => {
    const plan = planSeriesShift(weekly, [], [ex("x1", "2026-03-16"), ex("x2", "2026-04-13")], 2);
    expect(plan).toMatchObject({ ok: true, patch: { event_date: "2026-03-04", repeat_until: "2026-06-03" } });
    if (!plan.ok) return;
    expect(plan.exceptions).toEqual([
      { id: "x1", patch: { original_date: "2026-03-18" } },
      { id: "x2", patch: { original_date: "2026-04-15" } },
    ]);
  });

  it("keeps an override's offset from its key, including a resized end", () => {
    const plan = planSeriesShift(weekly, [ov("o1", "2026-03-09", "2026-03-10", "2026-03-11")], [], 2);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.overrides).toEqual([
      { id: "o1", patch: { original_date: "2026-03-11", new_date: "2026-03-12", new_end_date: "2026-03-13" } },
    ]);
  });

  it("leaves a time-only override's span alone (no new_end_date in the patch)", () => {
    const plan = planSeriesShift(weekly, [ov("o1", "2026-03-09", "2026-03-09")], [], -1);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.overrides[0].patch).toEqual({ original_date: "2026-03-08", new_date: "2026-03-08" });
  });

  it("monthly: a key follows its occurrence number across short months, not +delta days", () => {
    const monthly = makeEvent({ event_date: "2026-01-15", recurring: "Monthly" });
    const plan = planSeriesShift(monthly, [], [ex("x", "2026-02-15"), ex("stale", "2026-02-20")], 16); // Jan 15 -> Jan 31
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.patch.event_date).toBe("2026-01-31");
    expect(plan.exceptions).toEqual([
      { id: "x", patch: { original_date: "2026-02-28" } }, // Feb 15 was occurrence 1; the new series lands on Feb 28
      { id: "stale", patch: { original_date: "2026-03-08" } }, // not an occurrence: plain +16 days
    ]);
  });

  it("monthly: skips rows whose key does not change after clamping", () => {
    const monthly = makeEvent({ event_date: "2026-01-31", recurring: "Monthly" });
    const plan = planSeriesShift(monthly, [], [ex("x", "2026-02-28")], -3); // Jan 28: Feb 28 stays Feb 28
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.exceptions).toEqual([]);
  });

  it("yearly Feb 29: occurrence keys follow the clamped non-leap dates", () => {
    const yearly = makeEvent({ event_date: "2024-02-29", recurring: "Yearly" });
    const plan = planSeriesShift(yearly, [], [ex("x", "2025-02-28"), ex("y", "2028-02-29")], 1); // -> Mar 1
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.patch.event_date).toBe("2024-03-01");
    expect(plan.exceptions).toEqual([
      { id: "x", patch: { original_date: "2025-03-01" } },
      { id: "y", patch: { original_date: "2028-03-01" } },
    ]);
  });

  it("refuses when re-keyed rows would land on each other's current keys", () => {
    // Weekly shifted a full week: the Mar 9 row would take the Mar 16 row's key.
    expect(planSeriesShift(weekly, [], [ex("a", "2026-03-09"), ex("b", "2026-03-16")], 7)).toEqual({
      ok: false,
      error: SERIES_SHIFT_COLLISION_MESSAGE,
    });
    expect(planSeriesShift(weekly, [ov("a", "2026-03-09", "2026-03-09"), ov("b", "2026-03-16", "2026-03-16")], [], 7).ok).toBe(false);
    expect(planSeriesShift(weekly, [], [ex("a", "2026-03-09"), ex("b", "2026-03-16")], 3).ok).toBe(true);
  });

  it("allows a full-week shift when only one row exists", () => {
    expect(planSeriesShift(weekly, [], [ex("a", "2026-03-09")], 7).ok).toBe(true);
  });

  it("refuses a shift out of the supported years, a zero delta and non-recurring events", () => {
    const late = makeEvent({ event_date: "2100-12-30", recurring: "Weekly" });
    expect(planSeriesShift(late, [], [], 5)).toEqual({ ok: false, error: SERIES_SHIFT_RANGE_MESSAGE });
    expect(planSeriesShift(weekly, [], [], 0).ok).toBe(false);
    expect(planSeriesShift(weekly, [], [], 1.5).ok).toBe(false);
    expect(planSeriesShift(makeEvent({ event_date: "2026-03-02" }), [], [], 1).ok).toBe(false);
  });
});

describe("seriesShiftDescription", () => {
  it("says a weekly event dragged Monday to Wednesday becomes every Wednesday", () => {
    const ev = makeEvent({ event_date: "2026-03-02", recurring: "Weekly" }); // Monday
    expect(seriesShiftDescription(ev, 2)).toBe("Moves every event in the series 2 days later. It will repeat every Wednesday.");
  });

  it("singular day, earlier, and the monthly / yearly wording", () => {
    expect(seriesShiftDescription(makeEvent({ event_date: "2026-03-02", recurring: "Weekly" }), -1)).toContain("1 day earlier");
    expect(seriesShiftDescription(makeEvent({ event_date: "2026-03-02", recurring: "Monthly" }), 3)).toContain("5th of each month");
    expect(seriesShiftDescription(makeEvent({ event_date: "2026-03-02", recurring: "Yearly" }), 3)).toContain("March 5 each year");
  });
});

describe("planSeriesShift guards", () => {
  const weekly = { event_date: "2026-03-02", end_date: null, repeat_until: null, recurring: "Weekly" as const };

  it("refuses an absurdly large shift with the range message instead of throwing", () => {
    const r = planSeriesShift(weekly, [], [], 1e15);
    expect(r.ok).toBe(false);
    const r2 = planSeriesShift(weekly, [], [], 40000);
    expect(r2.ok).toBe(false);
  });

  it("refuses a shift that would push an override outside the supported years", () => {
    const r = planSeriesShift(
      { ...weekly, event_date: "2099-12-01" },
      [{ id: "o1", original_date: "2099-12-08", new_date: "2100-12-30", new_end_date: null }],
      [],
      2
    );
    expect(r.ok).toBe(false);
  });
});
