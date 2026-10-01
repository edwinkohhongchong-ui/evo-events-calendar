import { describe, it, expect } from "vitest";
import { computeGroupAggregate } from "../seasonSourceDateAggregate";
import { EXAM_SCHEDULE_SOURCES } from "../examScheduleSources";
import { expandEvents, expandEvent } from "../recurrence";
import { withOptimisticMove } from "../optimisticMove";
import { dueDate, expandTemplateItems, isOverdue, progressOf, computeAttention } from "../eventChecklist";
import { parseDateStr } from "../dates";
import { makeEvent, makeOcc } from "./fixtures";

describe("computeGroupAggregate", () => {
  it("empty and all-null", () => {
    expect(computeGroupAggregate([])).toEqual({ startDate: null, endDate: null, filledCount: 0, total: 0 });
    expect(computeGroupAggregate([{ start_date: null, end_date: null }]).filledCount).toBe(0);
  });
  it("earliest start, latest end; half-filled rows count as filled", () => {
    expect(computeGroupAggregate([
      { start_date: "2026-05-10", end_date: null },
      { start_date: "2026-05-02", end_date: "2026-06-01" },
      { start_date: null, end_date: "2026-06-20" },
    ])).toEqual({ startDate: "2026-05-02", endDate: "2026-06-20", filledCount: 3, total: 3 });
  });
  it("empty strings are treated as unfilled", () => {
    expect(computeGroupAggregate([{ start_date: "" as never, end_date: "" as never }]).filledCount).toBe(0);
  });
});

describe("EXAM_SCHEDULE_SOURCES", () => {
  it("every url is https and every category is a valid season category", () => {
    for (const g of EXAM_SCHEDULE_SOURCES) {
      expect(["School Schedule", "Exam Period"]).toContain(g.category);
      for (const i of g.institutions) expect(i.url).toMatch(/^https:\/\//);
    }
  });
});

describe("recurrence extra edges", () => {
  const r = (s: string, e: string) => [parseDateStr(s), parseDateStr(e)] as const;
  it("monthly 31st: Jan 31 -> Feb 28 (2026) -> Mar 31, and Feb 29 in 2028", () => {
    const ev = makeEvent({ event_date: "2026-01-31", recurring: "Monthly" });
    expect(expandEvents([ev], ...r("2026-01-01", "2026-04-30")).map((o) => o.occurrenceDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(expandEvents([ev], ...r("2028-02-01", "2028-02-29")).map((o) => o.occurrenceDate)).toEqual(["2028-02-29"]);
  });
  it("starting the range after a clamp does not drift (anchor-based)", () => {
    const ev = makeEvent({ event_date: "2026-01-31", recurring: "Monthly" });
    expect(expandEvents([ev], ...r("2026-03-01", "2026-03-31")).map((o) => o.occurrenceDate)).toEqual(["2026-03-31"]);
  });
  it("repeat_until is inclusive", () => {
    const ev = makeEvent({ event_date: "2026-10-01", recurring: "Weekly", repeat_until: "2026-10-15" });
    expect(expandEvents([ev], ...r("2026-10-01", "2026-12-31")).map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
  });
  it("repeat_until before the anchor yields nothing", () => {
    const ev = makeEvent({ event_date: "2026-10-01", recurring: "Weekly", repeat_until: "2026-09-01" });
    expect(expandEvents([ev], ...r("2026-09-01", "2026-12-31"))).toEqual([]);
  });
  it("weekly multi-day: occurrence starting before range start is included with correct span", () => {
    const ev = makeEvent({ event_date: "2026-09-01", end_date: "2026-09-03", recurring: "Weekly" });
    const o = expandEvents([ev], ...r("2026-10-07", "2026-10-31"));
    expect(o[0]).toMatchObject({ occurrenceDate: "2026-10-06", spanEndDate: "2026-10-08" });
  });
  it("non-recurring multi-day overlapping range start is kept; ending the day before is dropped", () => {
    const ev = makeEvent({ event_date: "2026-09-28", end_date: "2026-10-01" });
    expect(expandEvents([ev], ...r("2026-10-01", "2026-10-31"))).toHaveLength(1);
    expect(expandEvents([ev], ...r("2026-10-02", "2026-10-31"))).toHaveLength(0);
  });
  it("exceptions on every occurrence leave an empty list; yearly across year boundary", () => {
    const ev = makeEvent({ event_date: "2026-12-25", recurring: "Yearly" });
    expect(expandEvents([ev], ...r("2027-12-01", "2027-12-31")).map((o) => o.occurrenceDate)).toEqual(["2027-12-25"]);
    expect(expandEvent(ev, parseDateStr("2026-12-01"), parseDateStr("2026-12-31"), new Set(["2026-12-25"]))).toEqual([]);
  });
  it("a long-running weekly series expands fast (500 years of range would be a perf smell; 10y fine)", () => {
    const ev = makeEvent({ event_date: "2016-01-01", recurring: "Weekly" });
    expect(expandEvents([ev], ...r("2026-01-01", "2026-01-31")).length).toBeGreaterThan(3);
  });
});

describe("optimisticMove edges", () => {
  it("moves across a month and year boundary, and over a leap day", () => {
    const e = makeEvent({ event_date: "2026-12-30" });
    expect(withOptimisticMove(makeOcc(e, "2026-12-30", "2027-01-01"), "2027-01-02")).toMatchObject({ occurrenceDate: "2027-01-02", spanEndDate: "2027-01-04" });
    expect(withOptimisticMove(makeOcc(e, "2028-02-28"), "2028-03-01").spanEndDate).toBe("2028-03-01");
  });
  it("moving to the same date is a no-op", () => {
    const e = makeEvent({ event_date: "2026-10-05" });
    expect(withOptimisticMove(makeOcc(e, "2026-10-05", "2026-10-07"), "2026-10-05").spanEndDate).toBe("2026-10-07");
  });
  it("does not mutate the input", () => {
    const e = makeEvent({ event_date: "2026-10-05" });
    const o = makeOcc(e, "2026-10-05");
    withOptimisticMove(o, "2026-10-09");
    expect(o.occurrenceDate).toBe("2026-10-05");
  });
});

describe("eventChecklist extra edges", () => {
  it("due date follows month/year boundaries, leap day and negative (after) offsets", () => {
    expect(dueDate("2026-03-02", 1)).toBe("2026-02-23");
    expect(dueDate("2028-03-07", 1)).toBe("2028-02-29");
    expect(dueDate("2027-01-03", 2)).toBe("2026-12-20");
    expect(dueDate("2026-12-28", -1)).toBe("2027-01-04");
    expect(dueDate("2026-10-05", 0)).toBe("2026-10-05");
    expect(dueDate("2026-10-05", null)).toBeNull();
  });
  it("overdue is strictly after the due date (due today is not overdue)", () => {
    expect(isOverdue("2026-10-12", 1, false, "2026-10-05")).toBe(false);
    expect(isOverdue("2026-10-12", 1, false, "2026-10-06")).toBe(true);
  });
  it("after-event item (-1 week) is due 7 days after the event: not overdue on the due day, overdue the day after", () => {
    expect(isOverdue("2026-10-12", -1, false, "2026-10-10")).toBe(false);
    expect(isOverdue("2026-10-12", -1, false, "2026-10-19")).toBe(false);
    expect(isOverdue("2026-10-12", -1, false, "2026-10-20")).toBe(true);
  });
  it("repeat_count 0/null is treated as 1; negative repeated offsets keep stepping later", () => {
    const t = { id: "t", name: "t", items: [
      { id: "a", item: "A", repeat_count: 0, weeks_before: 2 },
      { id: "b", item: "B", repeat_count: null as never, weeks_before: null },
      { id: "c", item: "C", repeat_count: 3, weeks_before: -1 },
    ] };
    const out = expandTemplateItems(t as never);
    expect(out.map((x) => x.weeks_before)).toEqual([2, null, -1, -2, -3]);
  });
  it("progressOf with an empty list, and mixed before/after items picks the earliest deadline", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0, openWeeksBefore: null });
    expect(progressOf([{ done: false, weeks_before: -1 }, { done: false, weeks_before: 2 }, { done: true, weeks_before: 9 }]).openWeeksBefore).toBe(2);
    expect(progressOf([{ done: false, weeks_before: -1 }, { done: false, weeks_before: -3 }]).openWeeksBefore).toBe(-1);
  });
  it("computeAttention: items without a due offset never count; empty input is empty", () => {
    expect(computeAttention([], "2026-10-05")).toEqual([]);
    const ev = makeEvent({ event_date: "2026-01-01" });
    expect(computeAttention([{ event: ev, item: "x", weeks_before: null } as never], "2026-10-05")).toEqual([]);
  });
});
