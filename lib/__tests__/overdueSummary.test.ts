import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOverdueSummary, overdueWithoutOwner } from "../overdueSummary";
import { todayStr } from "../dates";
import type { OpenChecklistRow } from "../types";
import { makeEvent } from "./fixtures";

const row = (id: string, name: string, date: string, item: string, weeks: number): OpenChecklistRow => ({
  id: `${id}-${item}`,
  item,
  weeks_before: weeks,
  event: makeEvent({ id, name, event_date: date }),
});

afterEach(() => vi.useRealTimers());

describe("buildOverdueSummary", () => {
  it("returns null when nothing is overdue (due today is not overdue)", () => {
    // event 2026-03-24, 2 weeks before = 2026-03-10 = today
    expect(buildOverdueSummary([row("a", "Camp", "2026-03-24", "Book venue", 2)], "2026-03-10")).toBeNull();
    expect(buildOverdueSummary([], "2026-03-10")).toBeNull();
  });

  it("groups by event, soonest event first, most overdue item first, with day counts", () => {
    const text = buildOverdueSummary(
      [
        row("b", "Youth Night", "2026-04-10", "Poster", 4), // due 2026-03-13 -> 2 days
        row("a", "Camp", "2026-03-24", "Book venue", 3), // due 2026-03-03 -> 9 days
        row("a", "Camp", "2026-03-24", "Send invite", 2), // due 2026-03-10 -> not overdue today? today is 03-15 -> 5 days
      ],
      "2026-03-15"
    );
    expect(text).toBe(
      [
        "Overdue checklist items as of 15 Mar 2026 (3 across 2 events)",
        "",
        "Camp — 24 Mar 2026",
        "  - Book venue (12 days overdue)",
        "  - Send invite (5 days overdue)",
        "",
        "Youth Night — 10 Apr 2026",
        "  - Poster (2 days overdue)",
      ].join("\n")
    );
  });

  it("uses singular wording for 1 day / 1 event", () => {
    const text = buildOverdueSummary([row("a", "Camp", "2026-03-24", "Book venue", 2)], "2026-03-11")!;
    expect(text).toContain("(1 across 1 event)");
    expect(text).toContain("(1 day overdue)");
  });

  it("counts items due after the event (negative weeks_before)", () => {
    // event 2026-03-01, 1 week after = 2026-03-08; today 2026-03-10 -> 2 days overdue
    const text = buildOverdueSummary([row("a", "Retreat", "2026-03-01", "Thank-you notes", -1)], "2026-03-10")!;
    expect(text).toContain("Retreat — 1 Mar 2026");
    expect(text).toContain("Thank-you notes (2 days overdue)");
    // not yet due after the event
    expect(buildOverdueSummary([row("a", "Retreat", "2026-03-01", "Thank-you notes", -1)], "2026-03-08")).toBeNull();
  });

  it("follows the Singapore date: 17:00 UTC is already the next day", () => {
    vi.useFakeTimers();
    // 2026-03-09T17:00Z is 2026-03-10 01:00 in Singapore
    vi.setSystemTime(new Date("2026-03-09T17:00:00Z"));
    expect(todayStr()).toBe("2026-03-10");
    // due 2026-03-09: overdue by Singapore's date, though still the 9th in UTC
    const text = buildOverdueSummary([row("a", "Camp", "2026-03-23", "Book venue", 2)], todayStr())!;
    expect(text).toContain("Book venue (1 day overdue)");
  });
});

describe("overdueWithoutOwner", () => {
  it("counts overdue items where neither the item nor its event has an owner", () => {
    const owned = { ...row("a", "Camp", "2026-03-24", "Book venue", 3), owner: "Ann" };
    const inherited = { ...row("b", "Night", "2026-03-24", "Poster", 3), event: makeEvent({ id: "b", event_date: "2026-03-24", owner: "Bob" }) };
    const none = row("c", "Retreat", "2026-03-24", "Menu", 3);
    const notOverdue = row("d", "Later", "2026-09-24", "Menu", 3);
    expect(overdueWithoutOwner([owned, inherited, none, notOverdue], "2026-03-15")).toBe(1);
  });
});
