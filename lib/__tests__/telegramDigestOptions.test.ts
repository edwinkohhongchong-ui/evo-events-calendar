import { describe, expect, it } from "vitest";
import { buildDigest, cleanMultiline } from "../telegramDigest";
import { DEFAULT_DIGEST_CONFIG, type DigestConfig } from "../telegramDigestConfig";
import type { EventOccurrence, EventRow, HolidayRow } from "../types";

function ev(over: Partial<EventRow> & { name: string; event_date: string }): EventRow {
  return {
    id: over.id ?? over.name,
    end_date: null,
    event_time: null,
    end_time: null,
    duration_minutes: null,
    level: "Churchwide",
    recurring: "None",
    repeat_until: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    event_type: "Event",
    ...over,
  } as EventRow;
}
const occ = (e: EventRow): EventOccurrence => ({
  event: e,
  occurrenceDate: e.event_date,
  originalDate: e.event_date,
  isOverridden: false,
  startTime: e.event_time,
  endTime: e.end_time,
  spanEndDate: e.end_date ?? e.event_date,
});
const text = (m: string[]) => m.join("\n");

// Wednesday 14 Oct 2026. Week = Mon 12 .. Sun 18 Oct.
const TODAY = "2026-10-14";
const cfg = (over: Partial<DigestConfig> = {}): DigestConfig => ({ ...DEFAULT_DIGEST_CONFIG, ...over });

const events = [
  occ(ev({ name: "Earlier", event_date: "2026-10-13" })),
  occ(ev({ name: "Thursday Youth", event_date: "2026-10-15", level: "Youth" })),
  occ(ev({ name: "Sunday Service", event_date: "2026-10-18", level: "Churchwide", event_type: "Gathering" })),
  occ(ev({ name: "Next Week Adults", event_date: "2026-10-19", level: "Adults" })),
  occ(ev({ name: "Day Ten", event_date: "2026-10-23", level: "Youth" })),
  occ(ev({ name: "Late Oct", event_date: "2026-10-30", level: "Youth" })),
];

describe("buildDigest with a config", () => {
  it("default config reproduces the built-in message exactly", () => {
    const withBig = [...events, occ(ev({ name: "Big One", event_date: "2026-11-20", is_major: true }))];
    expect(buildDigest({ today: TODAY, events: withBig, config: cfg() })).toEqual(buildDigest({ today: TODAY, events: withBig }));
  });

  it("rest of month runs today to month end", () => {
    const t = text(buildDigest({ today: TODAY, events, config: cfg() }));
    expect(t).toContain("THIS MONTH (rest of the month)");
    expect(t).toContain("Late Oct");
    expect(t).not.toContain("Earlier");
  });

  it("this week runs today to the Sunday of the Monday-Sunday week", () => {
    const t = text(buildDigest({ today: TODAY, events, config: cfg({ range_mode: "this_week" }) }));
    expect(t).toContain("THIS WEEK");
    expect(t).toContain("Thursday Youth");
    expect(t).toContain("Sunday Service");
    expect(t).not.toContain("Next Week Adults");
    expect(t).not.toContain("Earlier");
    expect(t).not.toContain("COMING UP NEXT MONTH");
  });

  it("on a Sunday, this week is just today", () => {
    const sun = text(buildDigest({ today: "2026-10-18", events, config: cfg({ range_mode: "this_week" }) }));
    expect(sun).toContain("Sunday Service");
    expect(sun).not.toContain("Next Week Adults");
  });

  it("next N days counts today as day one", () => {
    const t = text(buildDigest({ today: TODAY, events, config: cfg({ range_mode: "next_days", range_days: 10 }) }));
    expect(t).toContain("NEXT 10 DAYS");
    expect(t).toContain("Day Ten"); // 23 Oct = today + 9
    expect(t).not.toContain("Late Oct");
    const nine = text(buildDigest({ today: TODAY, events, config: cfg({ range_mode: "next_days", range_days: 9 }) }));
    expect(nine).not.toContain("Day Ten");
    expect(text(buildDigest({ today: TODAY, events: [], config: cfg({ range_mode: "next_days", range_days: 1 }) }))).toContain(
      "Nothing is scheduled for the next 1 day yet."
    );
  });

  it("filters Events vs Gatherings", () => {
    const onlyEvents = text(buildDigest({ today: TODAY, events, config: cfg({ include_gatherings: false }) }));
    expect(onlyEvents).not.toContain("Sunday Service");
    expect(onlyEvents).toContain("Thursday Youth");
    const onlyGatherings = text(buildDigest({ today: TODAY, events, config: cfg({ include_events: false }) }));
    expect(onlyGatherings).toContain("Sunday Service");
    expect(onlyGatherings).not.toContain("Thursday Youth");
  });

  it("filters categories case-insensitively; empty means all", () => {
    const youth = text(buildDigest({ today: TODAY, events, config: cfg({ levels: ["yOUTH"] }) }));
    expect(youth).toContain("Thursday Youth");
    expect(youth).not.toContain("Sunday Service");
    expect(youth).not.toContain("Next Week Adults");
    const both = text(buildDigest({ today: TODAY, events, config: cfg({ levels: ["Youth", "ADULTS"] }) }));
    expect(both).toContain("Next Week Adults");
    expect(text(buildDigest({ today: TODAY, events, config: cfg({ levels: [] }) }))).toContain("Sunday Service");
  });

  it("still lists holidays whatever the category picks", () => {
    const holidays = [{ id: "h", holiday_date: "2026-10-20", name: "Fest Day", type: "Custom" }] as HolidayRow[];
    expect(text(buildDigest({ today: TODAY, events, holidays, config: cfg({ levels: ["Youth"] }) }))).toContain("Fest Day (holiday)");
  });

  describe("big events", () => {
    const big = [
      occ(ev({ id: "b1", name: "Big Near", event_date: "2026-10-25", is_major: true, level: "Youth" })),
      occ(ev({ id: "b2", name: "Big Far", event_date: "2026-12-30", is_major: true, level: "Adults" })),
    ];
    const counts = new Map([["b1", { total: 4, open: 1 }]]);

    it("can be switched off", () => {
      const t = text(buildDigest({ today: TODAY, events: big, config: cfg({ include_big_events: false }) }));
      expect(t).not.toContain("PLANNING CHECK");
      expect(t).not.toContain("Is everything in place");
    });

    it("uses the chosen weeks ahead in the heading and the window", () => {
      const t = text(buildDigest({ today: TODAY, events: big, config: cfg({ big_lookahead_weeks: 2 }) }));
      expect(t).toContain("big events in the next 2 weeks");
      expect(t).toContain("Is everything in place for Big Near");
      const none = text(buildDigest({ today: TODAY, events: big, config: cfg({ big_lookahead_weeks: 1 }) }));
      expect(none).toContain("No big events are flagged in the next 1 weeks.");
      expect(text(buildDigest({ today: TODAY, events: big, config: cfg({ big_lookahead_weeks: 26 }) }))).toContain("Big Far");
    });

    it("respects the category filter and the checklist-count toggle", () => {
      const adults = text(buildDigest({ today: TODAY, events: big, config: cfg({ levels: ["Adults"], big_lookahead_weeks: 26 }) }));
      expect(adults).not.toContain("Big Near");
      expect(adults).toContain("Big Far");
      const on = text(buildDigest({ today: TODAY, events: big, checklistCounts: counts, config: cfg() }));
      expect(on).toContain("1 of 4 checklist items still open");
      const off = text(buildDigest({ today: TODAY, events: big, checklistCounts: counts, config: cfg({ include_checklist_counts: false }) }));
      expect(off).not.toContain("checklist items");
      expect(off).toContain("Is everything in place for Big Near");
    });
  });

  it("puts the intro first and the closing line last, after the calendar link", () => {
    const out = buildDigest({
      today: TODAY,
      events,
      appUrl: "https://cal.example.org",
      config: cfg({ intro: "Good evening team‮", outro: "See you there!" }),
    });
    const lines = text(out).split("\n");
    expect(lines[0]).toBe("Good evening team");
    expect(lines[2]).toBe("+EVO calendar — October 2026");
    expect(lines[lines.length - 1]).toBe("See you there!");
    expect(text(out)).toContain("Open the calendar: https://cal.example.org");
  });

  describe("edited message", () => {
    it("replaces everything generated, cleaned, with line breaks kept", () => {
      const out = buildDigest({
        today: TODAY,
        events,
        config: cfg({ intro: "ignored intro", override_text: "Hello all‮\r\n\r\n\r\n\r\n- one\u0000thing\nBye" }),
      });
      expect(out).toEqual(["Hello all\n\n- one thing\nBye"]);
    });

    it("is chunked to 4000 characters at line breaks", () => {
      const long = Array.from({ length: 200 }, (_, i) => `Line ${i} ${"z".repeat(40)}`).join("\n");
      const out = buildDigest({ today: TODAY, events: [], config: cfg({ override_text: long }) });
      expect(out.length).toBeGreaterThan(1);
      for (const m of out) expect(m.length).toBeLessThanOrEqual(4000);
      expect(out.join("\n")).toContain("Line 199 ");
    });

    it("a blank edited message falls back to the automatic one", () => {
      expect(text(buildDigest({ today: TODAY, events, config: cfg({ override_text: " \n " }) }))).toContain("+EVO calendar");
    });
  });
});

describe("cleanMultiline", () => {
  it("keeps single and double line breaks, strips controls and zero-width characters", () => {
    expect(cleanMultiline("a\tb​c\n\n\n\nd\r\ne")).toBe("a b c\n\nd\ne");
    expect(cleanMultiline("x".repeat(20), 10)).toHaveLength(10);
    expect(cleanMultiline(null)).toBe("");
  });
});
