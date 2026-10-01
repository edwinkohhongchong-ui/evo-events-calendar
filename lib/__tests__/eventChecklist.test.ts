import { describe, it, expect } from "vitest";
import { dueDate, expandTemplateItems, isOverdue, progressOf, progressOverdue } from "../eventChecklist";

const template = {
  id: "t1",
  name: "Big Event Prep",
  items: [
    { id: "a", item: "Send invite", repeat_count: 1, weeks_before: 4 },
    { id: "b", item: "Pastoral check-in", repeat_count: 3, weeks_before: 3 },
    { id: "c", item: "Follow up", repeat_count: 1, weeks_before: null },
  ],
};

describe("eventChecklist", () => {
  it("expands repeats into numbered rows with stepped due offsets", () => {
    expect(expandTemplateItems(template)).toEqual([
      { item: "Send invite", weeks_before: 4 },
      { item: "Pastoral check-in — Week 1 of 3", weeks_before: 3 },
      { item: "Pastoral check-in — Week 2 of 3", weeks_before: 2 },
      { item: "Pastoral check-in — Week 3 of 3", weeks_before: 1 },
      { item: "Follow up", weeks_before: null },
    ]);
  });

  it("never schedules a repeated row after the event day", () => {
    const rows = expandTemplateItems({
      ...template,
      items: [{ id: "x", item: "Check-in", repeat_count: 4, weeks_before: 1 }],
    });
    expect(rows.map((r) => r.weeks_before)).toEqual([1, 0, 0, 0]);
  });

  it("derives due dates from the event date", () => {
    expect(dueDate("2026-12-20", 4)).toBe("2026-11-22");
    expect(dueDate("2026-12-20", null)).toBeNull();
  });

  it("flags overdue only for unticked items past their due date", () => {
    expect(isOverdue("2026-12-20", 4, false, "2026-11-23")).toBe(true);
    expect(isOverdue("2026-12-20", 4, false, "2026-11-22")).toBe(false);
    expect(isOverdue("2026-12-20", 4, true, "2026-12-01")).toBe(false);
    expect(isOverdue("2026-12-20", null, false, "2027-01-01")).toBe(false);
  });

  it("rolls up progress and the earliest open deadline", () => {
    const p = progressOf([
      { done: true, weeks_before: 4 },
      { done: false, weeks_before: 3 },
      { done: false, weeks_before: 1 },
      { done: false, weeks_before: null },
    ]);
    expect(p).toEqual({ done: 1, total: 4, openWeeksBefore: 3 });
    expect(progressOverdue(p, "2026-12-20", "2026-12-01")).toBe(true); // due 29 Nov
    expect(progressOverdue(p, "2026-12-20", "2026-11-29")).toBe(false);
  });
});
