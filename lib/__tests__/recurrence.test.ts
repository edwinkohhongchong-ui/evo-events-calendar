import { describe, it, expect } from "vitest";
import { expandEvents } from "../recurrence";
import { parseDateStr } from "../dates";
import { EventRow, Recurring } from "../types";

// Builds a full EventRow fixture with sane defaults, overridable per test.
// Keeps each test focused on the fields that actually matter for expansion
// (event_date, recurring, repeat_until, end_date) without repeating every
// unrelated column (pastoral_*, gathering_type, etc.) each time.
function makeEvent(overrides: Partial<EventRow> & { event_date: string; recurring: Recurring }): EventRow {
  return {
    id: "evt-1",
    name: "Test Event",
    end_date: null,
    event_time: "09:00:00",
    end_time: "10:00:00",
    duration_minutes: 60,
    level: "Churchwide",
    repeat_until: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    event_type: "Event",
    pastoral_youth: false,
    pastoral_poly: false,
    pastoral_uni: false,
    pastoral_adults: false,
    location: null,
    gathering_type: null,
    series: null,
    preacher_name: null,
    sermon_title: null,
    theme: null,
    ...overrides,
  };
}

describe("expandEvents", () => {
  it("expands a weekly recurring event across the visible range", () => {
    const event = makeEvent({
      event_date: "2026-01-05", // Monday
      recurring: "Weekly",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31")
    );

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
    ]);
  });

  // Monthly anchored on the 31st, walked across months with fewer days.
  // Each occurrence is computed from the anchor, so a clamp (Feb 28, Apr 30)
  // never sticks: the series returns to the 31st whenever the month has one.
  it("walks a monthly series anchored on the 31st, clamping to month end but returning to the 31st", () => {
    const event = makeEvent({
      event_date: "2026-01-31",
      recurring: "Monthly",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-05-31")
    );

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-31",
      "2026-02-28", // 2026 is not a leap year: clamped from the 31st
      "2026-03-31", // back on the 31st
      "2026-04-30", // April has 30 days
      "2026-05-31",
    ]);
  });

  // Yearly anchored on Feb 29 (a leap day): Feb 28 in non-leap years, and
  // Feb 29 again in the next leap year (computed from the anchor each time).
  it("walks a yearly series anchored on Feb 29, on Feb 28 in non-leap years and Feb 29 in leap years", () => {
    const event = makeEvent({
      event_date: "2024-02-29",
      recurring: "Yearly",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2024-01-01"),
      parseDateStr("2028-12-31")
    );

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29", // leap year again
    ]);
  });

  it("stops generating occurrences after repeat_until, even mid-range", () => {
    const event = makeEvent({
      event_date: "2026-01-05",
      recurring: "Weekly",
      repeat_until: "2026-01-19",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31")
    );

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  it("skips an occurrence date listed in event_exceptions but keeps the others", () => {
    const event = makeEvent({
      id: "evt-exc",
      event_date: "2026-01-05",
      recurring: "Weekly",
    });

    const exceptionsByEventId = new Map<string, Set<string>>([
      ["evt-exc", new Set(["2026-01-12"])],
    ]);

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31"),
      exceptionsByEventId
    );

    expect(occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-05",
      "2026-01-19",
      "2026-01-26",
    ]);
  });

  it("generates in-range occurrences even when the anchor date itself is outside the range", () => {
    const event = makeEvent({
      event_date: "2025-06-01", // anchor well before the visible range
      recurring: "Monthly",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31")
    );

    // 2025-06-01 -> ... -> 2026-01-01 by monthly steps, landing inside range.
    expect(occurrences.map((o) => o.occurrenceDate)).toEqual(["2026-01-01"]);
  });

  it("passes a non-recurring event through as exactly one occurrence", () => {
    const event = makeEvent({
      event_date: "2026-01-15",
      recurring: "None",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31")
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      occurrenceDate: "2026-01-15",
      originalDate: "2026-01-15",
      isOverridden: false,
    });
  });

  it("omits a non-recurring event whose date falls outside the range", () => {
    const event = makeEvent({
      event_date: "2026-02-15",
      recurring: "None",
    });

    const occurrences = expandEvents(
      [event],
      parseDateStr("2026-01-01"),
      parseDateStr("2026-01-31")
    );

    expect(occurrences).toHaveLength(0);
  });
});
