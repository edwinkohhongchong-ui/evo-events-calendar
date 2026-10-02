import { describe, it, expect } from "vitest";
import { buildTickUpdate, computeAttention, describeOffset, dueDate, expandTemplateItems, isOverdue, progressOf, progressOverdue, totalOverdueItems } from "../eventChecklist";
import type { EventRow, OpenChecklistRow } from "../types";

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

  it("supports negative offsets for after-the-event follow-ups", () => {
    const rows = expandTemplateItems({
      ...template,
      items: [{ id: "f", item: "Follow up", repeat_count: 2, weeks_before: -1 }],
    });
    expect(rows.map((r) => r.weeks_before)).toEqual([-1, -2]);
    expect(dueDate("2026-12-20", -1)).toBe("2026-12-27");
    expect(isOverdue("2026-12-20", -1, false, "2026-12-26")).toBe(false);
    expect(isOverdue("2026-12-20", -1, false, "2026-12-28")).toBe(true);
    expect(describeOffset(-1)).toBe("1 week after the event");
    expect(describeOffset(4)).toBe("4 weeks before the event");
    expect(describeOffset(0)).toBe("on the event day");
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

  it("treats the due day itself as not yet overdue, and dates after the event as overdue-able", () => {
    // weeks_before 0 = due on the event day; overdue only the day after.
    expect(isOverdue("2026-12-20", 0, false, "2026-12-20")).toBe(false);
    expect(isOverdue("2026-12-20", 0, false, "2026-12-21")).toBe(true);
    // Month/year rollover in the due-date arithmetic.
    expect(dueDate("2027-01-05", 2)).toBe("2026-12-22");
    expect(dueDate("2028-03-06", 1)).toBe("2028-02-28");
    expect(dueDate("2028-03-06", 2)).toBe("2028-02-21");
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

  describe("computeAttention", () => {
    const ev = (id: string, date: string) => ({ id, name: `Event ${id}`, event_date: date }) as EventRow;
    const row = (id: string, item: string, weeks: number, event: EventRow): OpenChecklistRow => ({
      id,
      item,
      weeks_before: weeks,
      event,
    });

    it("groups by event, names the worst item and counts the rest", () => {
      const a = ev("a", "2026-12-20"); // 4wk before = 22 Nov, 2wk = 6 Dec
      const rows = [row("1", "Send invite", 4, a), row("2", "Check-in", 2, a), row("3", "Later item", 0, a)];
      const out = computeAttention(rows, "2026-12-08");
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ worstItem: "Send invite", daysLate: 16, moreCount: 1 });
    });

    it("sorts the most overdue event first and skips events with nothing overdue yet", () => {
      const a = ev("a", "2026-12-20"); // item due 13 Dec: 1 day late on 14 Dec
      const b = ev("b", "2026-12-10"); // item due 12 Nov: 32 days late
      const c = ev("c", "2026-12-20"); // item due 20 Dec: not late yet
      const rows = [row("1", "A item", 1, a), row("2", "B item", 4, b), row("3", "C item", 0, c)];
      const out = computeAttention(rows, "2026-12-14");
      expect(out.map((o) => o.event.id)).toEqual(["b", "a"]);
      expect(out[0].daysLate).toBe(32);
    });

    it("counts total overdue items with the same rule as the chip", () => {
      const a = ev("a", "2026-12-20");
      const rows = [row("1", "x", 4, a), row("2", "y", 1, a), row("3", "z", 0, a)];
      expect(totalOverdueItems(rows, "2026-12-14")).toBe(2);
    });
  });
});

describe("buildTickUpdate", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const now = new Date("2026-10-02T00:00:00Z");

  it("ticks with timestamp and trimmed name, touching only done fields", () => {
    const r = buildTickUpdate(id, true, "  Sam ", now);
    expect(r.id).toBe(id);
    expect(r.patch).toEqual({ done: true, done_at: now.toISOString(), done_by: "Sam" });
  });
  it("unticking clears timestamp and name", () => {
    expect(buildTickUpdate(id, false, "Sam", now).patch).toEqual({ done: false, done_at: null, done_by: null });
  });
  it("blank or null name becomes null", () => {
    expect(buildTickUpdate(id, true, "  ", now).patch.done_by).toBeNull();
    expect(buildTickUpdate(id, true, null, now).patch.done_by).toBeNull();
  });
  it("rejects a bad id, non-boolean done, and bad names", () => {
    expect(() => buildTickUpdate("nope", true, null)).toThrow();
    expect(() => buildTickUpdate(undefined, true, null)).toThrow();
    expect(() => buildTickUpdate(id, "true", null)).toThrow();
    expect(() => buildTickUpdate(id, true, 5)).toThrow();
    expect(() => buildTickUpdate(id, true, "x".repeat(61))).toThrow();
    expect(buildTickUpdate(id, true, "x".repeat(60), now).patch.done_by).toHaveLength(60);
  });
});
