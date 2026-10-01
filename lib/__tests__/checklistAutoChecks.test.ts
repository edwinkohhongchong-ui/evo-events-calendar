import { describe, it, expect } from "vitest";
import { AUTO_CHECKS, resolveTargetMonthYear } from "../checklistAutoChecks";
import { ChecklistRow, SeasonRow } from "../types";

// Builds a full ChecklistRow fixture with sane defaults, overridable per test.
function makeItem(overrides: Partial<ChecklistRow> = {}): ChecklistRow {
  return {
    id: "item-1",
    category: "Pastoral Admin",
    item: "Mark out school holidays",
    status: "Not Started",
    target_month: null,
    notes: null,
    linked_event_id: null,
    auto_check_type: "school_holidays_present",
    ...overrides,
  };
}

function makeSeason(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: "season-1",
    name: "Test Term",
    category: "School Schedule",
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    notes: null,
    color: null,
    ...overrides,
  };
}

describe("resolveTargetMonthYear", () => {
  it("resolves to the current year when the month hasn't happened yet this year", () => {
    const now = new Date(2026, 9, 1); // Oct 1 2026
    expect(resolveTargetMonthYear("Nov", now)).toBe(2026);
    expect(resolveTargetMonthYear("Dec", now)).toBe(2026);
  });

  it("resolves to next year when the month has already passed this year", () => {
    const now = new Date(2026, 9, 1); // Oct 1 2026
    expect(resolveTargetMonthYear("Jan", now)).toBe(2027);
    expect(resolveTargetMonthYear("Jun", now)).toBe(2027);
  });

  it("treats the current month itself as not yet passed", () => {
    const now = new Date(2026, 9, 1); // Oct 1 2026
    expect(resolveTargetMonthYear("Oct", now)).toBe(2026);
  });
});

describe("AUTO_CHECKS.school_holidays_present", () => {
  const check = AUTO_CHECKS.school_holidays_present;

  it("skips silently (ok, no note) when target_month is null", async () => {
    const item = makeItem({ target_month: null });
    const result = await check(item, { seasons: [] });
    expect(result.ok).toBe(true);
    expect(result.note).toBe("");
  });

  it("passes when a School Schedule season overlaps the resolved month/year", async () => {
    const year = resolveTargetMonthYear("Jan");
    const item = makeItem({ target_month: "Jan" });
    const seasons = [makeSeason({ start_date: `${year}-01-10`, end_date: `${year}-02-05` })];
    const result = await check(item, { seasons });
    expect(result.ok).toBe(true);
    expect(result.note).toBe("");
  });

  it("fails with a flag note when no School Schedule season overlaps", async () => {
    const year = resolveTargetMonthYear("Jan");
    const item = makeItem({ target_month: "Jan" });
    const seasons = [makeSeason({ start_date: `${year - 5}-01-01`, end_date: `${year - 5}-01-31` })];
    const result = await check(item, { seasons });
    expect(result.ok).toBe(false);
    expect(result.note).toContain("January");
    expect(result.note).toContain(String(year));
  });

  it("ignores seasons of a different category even if dates overlap", async () => {
    const year = resolveTargetMonthYear("Jan");
    const item = makeItem({ target_month: "Jan" });
    const seasons = [
      makeSeason({
        category: "Ministry Season",
        start_date: `${year}-01-01`,
        end_date: `${year}-01-31`,
      }),
    ];
    const result = await check(item, { seasons });
    expect(result.ok).toBe(false);
  });
});
