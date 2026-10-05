import { describe, it, expect } from "vitest";
import { parseCalendarWorkbook, parseTimeLine, splitEventCell } from "../../excelImport/parseCalendarSheets";
import { MARCH_WEEKS, makeSheet, monthSheet, workbook } from "./helpers";

const march = (weeks: Parameters<typeof monthSheet>[2], header = 28) => monthSheet("Mar-26", header, weeks);
const parseMarch = (weeks: Parameters<typeof monthSheet>[2], header = 28) => parseCalendarWorkbook(workbook(march(weeks, header))).months[0];

describe("parseTimeLine", () => {
  it("reads 24h, 12h and single times", () => {
    expect(parseTimeLine("19:00 - 21:30")).toEqual({ start: "19:00:00", end: "21:30:00" });
    expect(parseTimeLine("8:30am - 9:30am")).toEqual({ start: "08:30:00", end: "09:30:00" });
    expect(parseTimeLine("8.30pm")).toEqual({ start: "20:30:00", end: null });
    expect(parseTimeLine("14:00")).toEqual({ start: "14:00:00", end: null });
    expect(parseTimeLine("9 - 10pm")).toEqual({ start: "21:00:00", end: "22:00:00" });
    expect(parseTimeLine("9am - 10pm")).toEqual({ start: "09:00:00", end: "22:00:00" });
    expect(parseTimeLine("11 - 1pm")).toEqual({ start: "11:00:00", end: "13:00:00" });
    expect(parseTimeLine("12:00am - 12:30pm")).toEqual({ start: "00:00:00", end: "12:30:00" });
  });
  it("rejects non-times", () => {
    expect(parseTimeLine("Youth camp")).toBeNull();
    expect(parseTimeLine("25:00")).toBeNull();
    expect(parseTimeLine("12")).toBeNull();
    expect(parseTimeLine("Level 3 - 4")).toBeNull();
  });
});

describe("splitEventCell", () => {
  it("splits several events by their times", () => {
    const r = splitEventCell("\nAlpha\nHall A\n10:00 - 11:00\nBeta\n14:00 - 15:00\nTrailing note");
    expect(r.map((e) => [e.name, e.details, e.start, e.end])).toEqual([
      ["Alpha", ["Hall A"], "10:00:00", "11:00:00"],
      ["Beta", [], "14:00:00", "15:00:00"],
      ["Trailing note", [], null, null],
    ]);
  });
});

describe("sheet recognition and header", () => {
  it("lists unrelated sheets as ignored and matches month sheets by prefix and 2-digit year", () => {
    const wb = workbook(
      makeSheet("Notes", { A1: "x" }),
      monthSheet("July-26", 28, [{ monday: "2026-06-29" }]),
      monthSheet("Sept-26", 5, [{ monday: "2026-08-31" }]),
      makeSheet("Checklist", { A1: "Yearly" })
    );
    const p = parseCalendarWorkbook(wb);
    expect(p.ignoredSheets).toEqual(["Notes"]);
    expect(p.months.map((m) => [m.month, m.year])).toEqual([[7, 2026], [9, 2026]]);
    expect(p.year).toBe(2026);
  });

  it("finds the header at different rows", () => {
    for (const header of [3, 28, 40]) {
      const m = parseMarch([{ monday: "2026-02-23", obs: { 2: "Some Day" } }], header);
      expect(m.observances).toHaveLength(1);
    }
  });

  it("flags a month sheet with no weekday header", () => {
    const p = parseCalendarWorkbook(workbook(makeSheet("Apr-26", { P5: "1", Q5: "2" })));
    expect(p.flags[0].code).toBe("no-weekday-header");
    expect(p.flags[0].severity).toBe("error");
    expect(p.months[0].events).toEqual([]);
  });

  it("flags a header with no day rows as unknown layout", () => {
    const sheet = makeSheet("Apr-26", Object.fromEntries(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((d, i) => [`${"PQRSTUV"[i]}3`, d])));
    expect(parseCalendarWorkbook(workbook(sheet)).flags[0].code).toBe("unknown-layout");
  });

  it("rejects years outside MIN_YEAR..MAX_YEAR and notes an A2 mismatch", () => {
    const p = parseCalendarWorkbook(workbook(makeSheet("Jan-2101", {}), makeSheet("Jan-1999", {})));
    expect(p.flags.filter((f) => f.code === "bad-year")).toHaveLength(2);
    expect(p.months).toHaveLength(0);
    const mismatch = parseCalendarWorkbook(workbook(monthSheet("Mar-26", 28, [{ monday: "2026-02-23" }], { A2: 2025 })));
    expect(mismatch.flags.some((f) => f.code === "bad-year" && f.severity === "warn")).toBe(true);
  });

  it("ignores the template junk left of column P", () => {
    const m = parseMarch([{ monday: "2026-02-23" }]);
    expect(m.events).toEqual([]);
    expect(m.observances).toEqual([]);
    expect(m.seasons).toEqual([]);
  });
});

describe("dates", () => {
  it("takes the previous month's tail and the next month's head from position", () => {
    const m = parseMarch([
      { monday: MARCH_WEEKS[0], events: { 0: "\nFirst\n10:00 - 11:00", 6: "\nSunday one\n09:00 - 10:00" } },
      ...MARCH_WEEKS.slice(1, 5).map((monday) => ({ monday })),
      { monday: MARCH_WEEKS[5], events: { 3: "\nLast\n10:00 - 11:00" } },
    ]);
    expect(m.events.map((e) => e.date)).toEqual(["2026-02-23", "2026-03-01", "2026-04-02"]);
    expect(m.events[0].flags.map((f) => f.code)).toContain("date-outside-month");
    expect(m.events[1].flags.map((f) => f.code)).not.toContain("date-outside-month");
    expect(m.events[2].flags.map((f) => f.code)).toContain("date-outside-month");
  });

  it("handles December into January", () => {
    const dec = monthSheet("Dec-26", 28, [{ monday: "2026-11-30", events: { 0: "\nA\n10:00 - 11:00" } }, { monday: "2026-12-07" }, { monday: "2026-12-14" }, { monday: "2026-12-21" }, { monday: "2026-12-28", events: { 6: "\nB\n10:00 - 11:00" } }]);
    const p = parseCalendarWorkbook(workbook(dec));
    expect(p.months[0].events.map((e) => e.date)).toEqual(["2026-11-30", "2027-01-03"]);
  });

  it("handles January starting in the previous December", () => {
    const jan = monthSheet("Jan-26", 28, [{ monday: "2025-12-29", obs: { 3: "New Year's Day" }, events: { 0: "\nA\n10:00 - 11:00" } }]);
    const m = parseCalendarWorkbook(workbook(jan)).months[0];
    expect(m.events[0].date).toBe("2025-12-29");
    expect(m.observances[0].date).toBe("2026-01-01");
  });

  it("flags a day number that does not match its place on the grid", () => {
    const sheet = march([{ monday: MARCH_WEEKS[1], obs: { 0: "X" } }]);
    sheet.cells.set("R29", { value: "9", text: "9", isFormula: false });
    const m = parseCalendarWorkbook(workbook(sheet)).months[0];
    expect(m.observances).toHaveLength(1);
  });
});

describe("observances", () => {
  it("splits the day number from the observance text", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], obs: { 0: "International Women's Day", 4: "Pi Day" } }]);
    expect(m.observances.map((o) => [o.date, o.name])).toEqual([["2026-03-02", "International Women's Day"], ["2026-03-06", "Pi Day"]]);
    expect(m.observances[0].source.cell).toBe("P29");
  });
});

describe("events", () => {
  it("reads a single event with location and time", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], events: { 2: "\nY: Night\nMain Hall\n19:30 - 21:00" } }]);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ date: "2026-03-04", name: "Y: Night", details: ["Main Hall"], start: "19:30:00", end: "21:00:00" });
    expect(m.events[0].source).toMatchObject({ sheet: "Mar-26", cell: "R30" });
  });

  it("splits a multi-event cell and flags each", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\nOne\n09:00 - 10:00\nTwo\nRoom 2\n11:00 - 12:00" } }]);
    expect(m.events).toHaveLength(2);
    expect(m.events.every((e) => e.flags.some((f) => f.code === "multi-event-cell"))).toBe(true);
    expect(m.events[1].details).toEqual(["Room 2"]);
  });

  it("flags an event with no time, and a time with no name", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\nSomething\nvenue", 2: "\n10:00 - 11:00" } }]);
    expect(m.events[0].flags.map((f) => f.code)).toEqual(["no-time"]);
    expect(m.events[1].flags.map((f) => f.code)).toContain("no-name");
    expect(m.events[1].flags.find((f) => f.code === "no-name")?.severity).toBe("error");
  });

  it("treats a Monday list as a week note but a Monday event as an event", () => {
    const m = parseMarch([
      { monday: MARCH_WEEKS[1], events: { 0: "Weelday:\nTG\nPrayer" } },
      { monday: MARCH_WEEKS[2], events: { 0: "\nMonday thing\n10:00 - 11:00" } },
      { monday: MARCH_WEEKS[3], events: { 0: "AGH:" } },
      { monday: MARCH_WEEKS[4], events: { 0: "Just a name" } },
    ]);
    expect(m.weekNotes).toHaveLength(1);
    expect(m.weekNotes[0]).toMatchObject({ weekStart: "2026-03-02", weekEnd: "2026-03-08" });
    const names = m.events.map((e) => e.name);
    expect(names).toEqual(["Monday thing", "AGH:", "Just a name"]);
    expect(m.events[1].flags.map((f) => f.code)).toEqual(expect.arrayContaining(["ambiguous-week-note", "no-time"]));
    expect(m.events[2].flags.map((f) => f.code)).toEqual(["no-time"]);
  });

  it("keeps same text on different days as separate events", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\nQT\n07:00 - 08:00", 2: "\nQT\n07:00 - 08:00" } }]);
    expect(m.events.map((e) => e.date)).toEqual(["2026-03-03", "2026-03-04"]);
  });

  it("truncates source text to 200 characters", () => {
    const m = parseMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\nLong " + "x".repeat(400) + "\n10:00 - 11:00" } }]);
    expect(m.events[0].source.text.length).toBe(200);
  });
});

describe("seasons", () => {
  const tagWeek = (monday: string, tags: NonNullable<Parameters<typeof monthSheet>[2][0]["tags"]>, events?: Record<number, string>) => ({ monday, tagRows: 2, tags, events });

  it("covers a whole week with a merged range and keeps the events row separate", () => {
    const m = parseMarch([tagWeek(MARCH_WEEKS[1], [{ row: 0, col: 0, text: "LBF", across: 6 }], { 1: "\nEv\n10:00 - 11:00" })]);
    expect(m.seasons).toHaveLength(1);
    expect(m.seasons[0]).toMatchObject({ text: "LBF", start: "2026-03-02", end: "2026-03-08" });
    expect(m.events).toHaveLength(1);
  });

  it("handles partial spans and unmerged single-day tags", () => {
    const m = parseMarch([tagWeek(MARCH_WEEKS[1], [{ row: 0, col: 1, text: "Poly Examinations", across: 3 }, { row: 1, col: 6, text: "Uni Examinations" }]), { monday: MARCH_WEEKS[2] }]);
    expect(m.seasons.map((s) => [s.text, s.start, s.end])).toEqual([
      ["Poly Examinations", "2026-03-03", "2026-03-06"],
      ["Uni Examinations", "2026-03-08", "2026-03-08"],
    ]);
  });

  it("handles a vertical merge (anchored once)", () => {
    const m = parseMarch([tagWeek(MARCH_WEEKS[1], [{ row: 0, col: 1, text: "SP Examinations", down: 1 }])]);
    expect(m.seasons).toHaveLength(1);
    expect(m.seasons[0]).toMatchObject({ start: "2026-03-03", end: "2026-03-03" });
  });

  it("joins the same tag across consecutive weeks into one season", () => {
    const m = parseMarch([
      tagWeek(MARCH_WEEKS[1], [{ row: 0, col: 0, text: "Poly and Uni Holidays", across: 6 }]),
      tagWeek(MARCH_WEEKS[2], [{ row: 0, col: 0, text: "Poly and Uni Holidays", across: 6 }]),
      tagWeek(MARCH_WEEKS[3], [{ row: 0, col: 0, text: "Poly and Uni Holidays", across: 2 }]),
    ]);
    expect(m.seasons).toHaveLength(1);
    expect(m.seasons[0]).toMatchObject({ start: "2026-03-02", end: "2026-03-18" });
  });

  it("keeps a non-contiguous repeat as a separate season", () => {
    const m = parseMarch([
      tagWeek(MARCH_WEEKS[1], [{ row: 0, col: 0, text: "LBF", across: 6 }]),
      tagWeek(MARCH_WEEKS[2], []),
      tagWeek(MARCH_WEEKS[3], []),
      tagWeek(MARCH_WEEKS[4], [{ row: 0, col: 0, text: "LBF", across: 6 }]),
    ]);
    expect(m.seasons).toHaveLength(2);
  });

  it("uses dates written in the tag and validates them against the grid", () => {
    const ok = parseMarch([tagWeek("2026-03-02", [{ row: 0, col: 0, text: "CYCLE 7 (27 FEB - 15 MAR)", across: 6 }])]);
    expect(ok.seasons[0]).toMatchObject({ start: "2026-02-27", end: "2026-03-15", explicitDates: true });
    expect(ok.seasons[0].flags).toEqual([]);
    const bad = parseMarch([tagWeek("2026-03-02", [{ row: 0, col: 0, text: "CYCLE 7 (30 NOV - 31 DEC)", across: 6 }])]);
    expect(bad.seasons[0].flags.map((f) => f.code)).toContain("season-date-mismatch");
  });

  it("flags month-only ranges and stale years", () => {
    const m = parseMarch([tagWeek("2026-03-02", [{ row: 0, col: 0, text: "RF 2026 / 2027 (Dec - Feb)", across: 6 }, { row: 1, col: 0, text: "RF 2023 / 2024 (Nov - Feb)", across: 6 }])]);
    const fresh = m.seasons.find((s) => s.text.startsWith("RF 2026"))!;
    const stale = m.seasons.find((s) => s.text.startsWith("RF 2023"))!;
    expect(fresh.flags.map((f) => f.code)).toEqual(["season-no-dates"]);
    expect(stale.flags.map((f) => f.code)).toContain("stale-year-in-text");
  });

  it("reads a season-only block with no events row", () => {
    const sheet = monthSheet("Mar-26", 28, [{ monday: "2026-03-02", tagRows: 1, tags: [{ row: 0, col: 0, text: "LBF", across: 6 }] }]);
    // the 'events row' is the merged tag row itself
    const m = parseCalendarWorkbook(workbook(sheet)).months[0];
    expect(m.seasons).toHaveLength(1);
    expect(m.events).toHaveLength(0);
  });
});

describe("checklist", () => {
  const cl = (rows: Array<[string | number | undefined, string | undefined, (string | number | boolean | undefined)?]>, a1 = "Yearly") => {
    const cells: Record<string, string | number | boolean> = { A1: a1, A2: "NO.", B2: "ITEM", C2: "DONE?" };
    rows.forEach(([a, b, c], i) => {
      const r = i + 3;
      if (a !== undefined) cells[`A${r}`] = a;
      if (b !== undefined) cells[`B${r}`] = b;
      if (c !== undefined) cells[`C${r}`] = c;
    });
    return parseCalendarWorkbook(workbook(makeSheet("Checklist", cells))).checklist;
  };

  it("reads items, numbers, done flags and sub-bullets", () => {
    const items = cl([
      [1, "Prepare slides\nPri/Sec/JC\nPoly\nUni", 1],
      [2, "Book hall", 0],
      [3, "Order shirts", true],
      [4, "Print flyers"],
      [undefined, "A loose extra line"],
    ]);
    expect(items.map((i) => [i.section, i.number, i.item, i.subitems, i.done])).toEqual([
      ["Yearly", "1", "Prepare slides", ["Pri/Sec/JC", "Poly", "Uni"], true],
      ["Yearly", "2", "Book hall", [], false],
      ["Yearly", "3", "Order shirts", [], true],
      ["Yearly", "4", "Print flyers", ["A loose extra line"], null],
    ]);
    expect(items[3].flags.map((f) => f.code)).toEqual(["no-done-flag"]);
    expect(items[0].source).toMatchObject({ sheet: "Checklist", cell: "B3" });
  });

  it("starts a new section on a heading row", () => {
    const items = cl([[1, "One", 1], ["Quarterly", undefined], ["NO.", "ITEM", "DONE?"], [1, "Two", 0]]);
    expect(items.map((i) => [i.section, i.item])).toEqual([["Yearly", "One"], ["Quarterly", "Two"]]);
  });
});

describe("real-world quirks", () => {
  it("reads 'onwards', trailing and leading times", () => {
    expect(splitEventCell("\nDoors\n18:00 onwards")).toEqual([{ name: "Doors", details: [], start: "18:00:00", end: null }]);
    expect(splitEventCell("\nCell night: 10-10.30pm")).toEqual([{ name: "Cell night", details: [], start: "22:00:00", end: "22:30:00" }]);
    expect(splitEventCell("\nDinner (7.30-10pm)")).toEqual([{ name: "Dinner", details: [], start: "19:30:00", end: "22:00:00" }]);
    expect(splitEventCell("\n3pm Lunch\nWith the team\nRoom 5")).toEqual([{ name: "Lunch", details: ["With the team", "Room 5"], start: "15:00:00", end: null }]);
    expect(splitEventCell("Level 2 meeting")).toEqual([{ name: "Level 2 meeting", details: [], start: null, end: null }]);
  });

  it("anchors dates on the 1st of the month when a hand-edited sheet carries stale day numbers", () => {
    // first week reads 24 25 26 27 28 28 1 (Sat is a stale duplicate, Mon is stale): the 1 is on Sunday
    const sheet = monthSheet("Mar-26", 28, [{ monday: MARCH_WEEKS[0], events: { 2: "\nE\n10:00 - 11:00" } }, { monday: MARCH_WEEKS[1] }]);
    sheet.cells.set("P29", { value: "24", text: "24", isFormula: false });
    sheet.cells.set("U29", { value: "28", text: "28", isFormula: false });
    sheet.cells.set("T29", { value: "28", text: "28", isFormula: false });
    const p = parseCalendarWorkbook(workbook(sheet));
    expect(p.months[0].events[0].date).toBe("2026-02-25");
    expect(p.flags.find((f) => f.code === "unknown-layout")?.severity).toBe("warn");
  });
});

describe("events among the season tags", () => {
  it("treats a tag-row cell with a time as an event, not a season", () => {
    const m = parseCalendarWorkbook(
      workbook(monthSheet("Mar-26", 28, [{ monday: "2026-03-02", tagRows: 2, tags: [{ row: 0, col: 2, text: "Staff lunch 12:30 - 13:30" }, { row: 1, col: 0, text: "LBF", across: 6 }] }, { monday: "2026-03-09" }])
      )
    ).months[0];
    expect(m.seasons.map((s) => s.text)).toEqual(["LBF"]);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({ name: "Staff lunch", date: "2026-03-04", start: "12:30:00" });
    expect(m.events[0].flags.map((f) => f.code)).toContain("event-in-season-row");
  });
});
