import { describe, expect, it } from "vitest";
import { sgDateStr } from "../dates";
import { expandEvents } from "../recurrence";
import { LOOKAHEAD_WEEKS, MAX_MESSAGE_CHARS, buildDigest, chunkLines, cleanText } from "../telegramDigest";
import type { EventOccurrence, EventRow, HolidayRow } from "../types";
import { parseDateStr } from "../dates";

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

const text = (msgs: string[]) => msgs.join("\n");

// Sunday 11 Oct 2026.
const TODAY = "2026-10-11";

describe("buildDigest", () => {
  it("always produces a message, with a friendly line when nothing is scheduled", () => {
    const out = buildDigest({ today: TODAY, events: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("+EVO calendar — October 2026");
    expect(out[0]).toContain("Nothing else is scheduled");
    expect(out[0]).toContain("No big events are flagged");
  });

  it("groups the rest of the month by Monday-Sunday week and marks gatherings", () => {
    const events = [
      occ(ev({ name: "Youth Night", event_date: "2026-10-16", event_time: "19:30:00", level: "Youth" })),
      occ(ev({ name: "Sunday Service", event_date: "2026-10-18", event_time: "10:00:00", event_type: "Gathering" })),
      occ(ev({ name: "Sat Games", event_date: "2026-10-17" })),
      occ(ev({ name: "Today Thing", event_date: TODAY })),
      occ(ev({ name: "Yesterday", event_date: "2026-10-10" })),
      occ(ev({ name: "Next Month Thing", event_date: "2026-11-02" })),
    ];
    const t = text(buildDigest({ today: TODAY, events }));
    const weeks = t.match(/^Week of .*$/gm);
    expect(weeks).toEqual(["Week of Mon 5 Oct", "Week of Mon 12 Oct"]);
    // Today (Sunday 11th) belongs to the week that started Monday 5th.
    expect(t.indexOf("Today Thing")).toBeLessThan(t.indexOf("Week of Mon 12 Oct"));
    expect(t).toContain("- Fri 16 Oct: 7:30 PM Youth Night (Youth)");
    expect(t).toContain("[Gathering]");
    expect(t.indexOf("Sat Games")).toBeLessThan(t.indexOf("Sunday Service"));
    expect(t).not.toContain("Yesterday");
    // Next month's items are not in THIS MONTH.
    expect(t.slice(0, t.indexOf("COMING UP NEXT MONTH"))).not.toContain("Next Month Thing");
  });

  it("shows next month's first items only when this month is nearly over", () => {
    const next = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) =>
      occ(ev({ name: `N${d}`, event_date: d }))
    );
    const quiet = text(buildDigest({ today: TODAY, events: next }));
    expect(quiet).toContain("COMING UP NEXT MONTH (November)");
    expect(quiet).toContain("N2026-11-06");
    expect(quiet).not.toContain("N2026-11-07"); // capped at 5

    const busy = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map((d) => occ(ev({ name: `B${d}`, event_date: d })));
    expect(text(buildDigest({ today: TODAY, events: [...busy, ...next] }))).not.toContain("COMING UP NEXT MONTH");
  });

  it("lists holidays but not school schedule entries", () => {
    const holidays = [
      { id: "1", holiday_date: "2026-10-20", name: "Fest Day", type: "Custom" },
      { id: "2", holiday_date: "2026-10-21", name: "Term Break", type: "School Schedule" },
    ] as HolidayRow[];
    const t = text(buildDigest({ today: TODAY, events: [], holidays }));
    expect(t).toContain("Fest Day (holiday)");
    expect(t).not.toContain("Term Break");
  });

  describe("planning check", () => {
    it("looks 8 weeks ahead, beyond the month, with a question and when-label", () => {
      expect(LOOKAHEAD_WEEKS).toBe(8);
      const events = [
        occ(ev({ name: "Spring Retreat", event_date: "2026-12-06", is_major: true })), // 8 weeks (56 days)
        occ(ev({ name: "Too Far", event_date: "2026-12-07", is_major: true })), // 57 days
        occ(ev({ name: "Not Flagged", event_date: "2026-11-01" })),
        occ(ev({ name: "Soon Big", event_date: "2026-10-14", is_major: true })),
        occ(ev({ name: "Tomorrow Big", event_date: "2026-10-12", is_major: true })),
        occ(ev({ name: "Past Big", event_date: "2026-10-10", is_major: true })),
      ];
      const t = text(buildDigest({ today: TODAY, events }));
      const plan = t.slice(t.indexOf("PLANNING CHECK"));
      expect(plan).toContain("Is everything in place for Spring Retreat (in 8 weeks)? Reply here with what's still needed.");
      expect(plan).toContain("Is everything in place for Soon Big (in 3 days)?");
      expect(plan).toContain("Is everything in place for Tomorrow Big (tomorrow)?");
      expect(plan).not.toContain("Too Far");
      expect(plan).not.toContain("Not Flagged");
      expect(plan).not.toContain("Past Big");
      // Chronological.
      expect(plan.indexOf("Tomorrow Big")).toBeLessThan(plan.indexOf("Soon Big"));
      expect(plan.indexOf("Soon Big")).toBeLessThan(plan.indexOf("Spring Retreat"));
    });

    it("catches the next occurrence of a yearly recurring big event", () => {
      const yearly = ev({ name: "Annual Feast", event_date: "2024-12-06", recurring: "Yearly", is_major: true });
      const occurrences = expandEvents([yearly], parseDateStr(TODAY), parseDateStr("2026-12-31"));
      const t = text(buildDigest({ today: TODAY, events: occurrences }));
      expect(t).toContain("★ Annual Feast — Sun 6 Dec 2026 (in 8 weeks)");
    });

    it("reports open checklist items for one-off events only", () => {
      const one = ev({ id: "a", name: "Big One", event_date: "2026-11-01", is_major: true });
      const series = ev({ id: "b", name: "Big Series", event_date: "2026-11-02", is_major: true, recurring: "Yearly" });
      const counts = new Map([
        ["a", { total: 8, open: 3 }],
        ["b", { total: 4, open: 4 }],
      ]);
      const t = text(buildDigest({ today: TODAY, events: [occ(one), occ(series)], checklistCounts: counts }));
      expect(t).toContain("3 of 8 checklist items still open");
      expect(t).not.toContain("4 of 4");
      const done = text(buildDigest({ today: TODAY, events: [occ(one)], checklistCounts: new Map([["a", { total: 2, open: 0 }]]) }));
      expect(done).toContain("All 2 checklist items are done");
    });
  });

  it("uses the Singapore day, not the UTC day, at the Sunday boundary", () => {
    // 2026-10-11 16:30 UTC is already Monday 00:30 in Singapore.
    expect(sgDateStr(new Date("2026-10-11T16:30:00Z"))).toBe("2026-10-12");
    // The scheduled 11:30 UTC Sunday is 19:30 Sunday in Singapore.
    expect(sgDateStr(new Date("2026-10-11T11:30:00Z"))).toBe("2026-10-11");
    const monday = buildDigest({ today: sgDateStr(new Date("2026-10-11T16:30:00Z")), events: [occ(ev({ name: "Sun Thing", event_date: "2026-10-11" }))] });
    expect(text(monday)).not.toContain("Sun Thing");
  });

  it("strips control characters and caps long names", () => {
    const nasty = occ(ev({ name: "Bad\nName\u0000\u202E\r\n- Fake: line" + "x".repeat(300), event_date: "2026-10-13" }));
    const t = text(buildDigest({ today: TODAY, events: [nasty] }));
    expect(t).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u202E]/);
    expect(t.split("\n").filter((l) => l.startsWith("- ")).length).toBe(1);
    expect(t).toContain("…");
    expect(cleanText("a\tb\nc", 10)).toBe("a b c");
  });

  it("splits long output into messages of at most 4000 characters at line boundaries", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      occ(ev({ name: `Event number ${i} ${"y".repeat(60)}`, event_date: `2026-10-${String(12 + (i % 19)).padStart(2, "0")}`, id: `e${i}` }))
    );
    const out = buildDigest({ today: TODAY, events: many });
    expect(out.length).toBeGreaterThan(1);
    for (const m of out) expect(m.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    const flat = out.join("\n");
    for (let i = 0; i < 300; i++) expect(flat).toContain(`Event number ${i} `);
  });

  it("only adds an http(s) calendar link", () => {
    expect(text(buildDigest({ today: TODAY, events: [], appUrl: "https://cal.example.org" }))).toContain("Open the calendar: https://cal.example.org");
    expect(text(buildDigest({ today: TODAY, events: [], appUrl: "javascript:alert(1)" }))).not.toContain("Open the calendar");
  });
});

describe("chunkLines", () => {
  it("never splits a line and trims blank edges", () => {
    expect(chunkLines(["", "a", "b", ""], 6)).toEqual(["a\nb"]);
    expect(chunkLines(["aaa", "bbb", "ccc"], 8)).toEqual(["aaa\nbbb", "ccc"]);
  });
});

describe("buildDigest event checklists", () => {
  const cfg = (over: Record<string, unknown> = {}) =>
    ({
      range_mode: "rest_of_month",
      range_days: 7,
      include_events: true,
      include_gatherings: true,
      levels: [],
      include_big_events: true,
      big_lookahead_weeks: 8,
      include_checklist_counts: true,
      intro: null,
      outro: null,
      override_text: null,
      ...over,
    }) as unknown as import("../telegramDigestConfig").DigestConfig;
  const it_ = (item: string, o: Partial<import("../telegramDigest").DigestChecklistItem> = {}) => ({
    item,
    owner: null,
    done: false,
    weeks_before: null,
    ...o,
  });
  const map = (id: string, items: ReturnType<typeof it_>[]) => new Map([[id, items]]);
  const run = (events: EventOccurrence[], items: Map<string, ReturnType<typeof it_>[]>, c = cfg(), today = TODAY) =>
    text(buildDigest({ today, events, checklistItems: items, config: c }));

  it("lists open items with owner and due date, summary first", () => {
    const e = ev({ id: "a", name: "Retreat", event_date: "2026-10-25" });
    const out = run([occ(e)], map("a", [it_("Book venue", { owner: "Sam", weeks_before: 2 }), it_("Done thing", { done: true })]), cfg({ include_big_events: false }));
    expect(out).toContain("- Sun 25 Oct: Retreat");
    expect(out).toContain("  Checklist 1/2 done\n  ☐ Book venue — owner Sam — due 11 Oct");
    expect(out).not.toContain("Done thing");
  });

  it("shows a single line when everything is done, nothing when empty", () => {
    const e = ev({ id: "a", name: "Retreat", event_date: "2026-10-25" });
    const c = cfg({ include_big_events: false });
    expect(run([occ(e)], map("a", [it_("x", { done: true }), it_("y", { done: true })]), c)).toContain("  Checklist ✓ 2/2 done");
    expect(run([occ(e)], map("a", []), c)).not.toContain("Checklist");
  });

  it("marks overdue by the Singapore day boundary", () => {
    const e = ev({ id: "a", name: "Retreat", event_date: "2026-10-25" });
    const items = map("a", [it_("Poster", { weeks_before: 2 })]); // due 11 Oct
    const c = cfg({ include_big_events: false });
    // 10 Oct 23:30 UTC is already 11 Oct in Singapore: due today, not overdue.
    const sgToday = sgDateStr(new Date("2026-10-10T23:30:00Z"));
    expect(sgToday).toBe("2026-10-11");
    expect(run([occ(e)], items, c, sgToday)).not.toContain("overdue");
    expect(run([occ(e)], items, c, "2026-10-12")).toContain("due 11 Oct (overdue)");
  });

  it("caps open items and reports the rest", () => {
    const e = ev({ id: "a", name: "Retreat", event_date: "2026-10-25" });
    const many = Array.from({ length: 11 }, (_, i) => it_(`Task ${i}`, { sort_order: i }));
    const out = run([occ(e)], map("a", many), cfg({ include_big_events: false }));
    expect(out.match(/☐/g)).toHaveLength(8);
    expect(out).toContain("+3 more open");
  });

  it("shows a recurring series' checklist only on its first listed occurrence", () => {
    const e = ev({ id: "w", name: "Prayer", event_date: "2026-10-12", recurring: "Weekly", repeat_until: "2026-10-31" });
    const occs = expandEvents([e], parseDateStr("2026-10-11"), parseDateStr("2026-10-31"), new Map());
    const out = run(occs, map("w", [it_("Prep", { weeks_before: 1 })]), cfg({ include_big_events: false }));
    expect(occs.length).toBeGreaterThan(1);
    expect(out.match(/Checklist 0\/1 done/g)).toHaveLength(1);
    expect(out).toContain("due 5 Oct (overdue)"); // computed from the 12 Oct occurrence
  });

  it("shows nothing when the toggle is off, and works in the big-event section", () => {
    const e = ev({ id: "a", name: "Big Day", event_date: "2026-10-25", is_major: true } as never);
    const items = map("a", [it_("Poster")]);
    expect(run([occ(e)], items, cfg({ include_checklist_counts: false }))).not.toContain("Checklist");
    const on = run([occ(e)], items, cfg({ range_mode: "next_days", range_days: 1 }));
    expect(on).toContain("PLANNING CHECK");
    expect(on).toContain("  Checklist 0/1 done\n  ☐ Poster");
  });

  it("strips control characters in item and owner and keeps chunks within the limit", () => {
    const e = ev({ id: "a", name: "Retreat", event_date: "2026-10-25" });
    const out = run([occ(e)], map("a", [it_("Bad\nitem‮", { owner: "Own\u0000er" })]), cfg({ include_big_events: false }));
    expect(out).toContain("☐ Bad item — owner Own er");
    const events = Array.from({ length: 60 }, (_, i) => occ(ev({ id: `e${i}`, name: `Event ${i}`, event_date: "2026-10-25" })));
    const items = new Map(events.map((o) => [o.event.id, Array.from({ length: 9 }, (_, i) => it_("x".repeat(120), { owner: "o".repeat(50), weeks_before: i }))]));
    const msgs = buildDigest({ today: TODAY, events, checklistItems: items, config: cfg() });
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });
});
