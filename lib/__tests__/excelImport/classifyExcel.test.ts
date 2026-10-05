import { describe, it, expect } from "vitest";
import { classifyWorkbook, guessEvent } from "../../excelImport/classifyExcel";
import { parseCalendarWorkbook } from "../../excelImport/parseCalendarSheets";
import { SEASON_COLOR_KEYS } from "../../constants";
import { MARCH_WEEKS, makeSheet, monthSheet, workbook } from "./helpers";

const classifyMarch = (weeks: Parameters<typeof monthSheet>[2]) => classifyWorkbook(parseCalendarWorkbook(workbook(monthSheet("Mar-26", 28, weeks))));
const ev = (text: string) => classifyMarch([{ monday: MARCH_WEEKS[1], events: { 1: `\n${text}\n10:00 - 11:30` } }]).events[0];

describe("guessEvent levels and prefixes", () => {
  it("maps single-letter prefixes to a level and normalises the title prefix", () => {
    expect(guessEvent("Y. QT")).toMatchObject({ name: "Y: QT", level: "Youth", focus: { youth: true } });
    expect(guessEvent("P: Retreat")).toMatchObject({ name: "P: Retreat", level: "Poly", focus: { poly: true } });
    expect(guessEvent("U. Social")).toMatchObject({ name: "U: Social", level: "Uni" });
    expect(guessEvent("A: Brunch")).toMatchObject({ name: "A: Brunch", level: "Adults" });
  });
  it("uses pastoral flags and no single level for combined prefixes", () => {
    const g = guessEvent("PU. Joint night");
    expect(g.name).toBe("PU: Joint night");
    expect(g.level).toBe("");
    expect(g.focus).toMatchObject({ poly: true, uni: true, youth: false });
    expect(g.flags.map((f) => f.code)).toEqual(["level-unknown"]);
    expect(guessEvent("UP: x").name).toBe("PU: x");
  });
  it("applies keyword rules", () => {
    expect(guessEvent("+EVO YTH camp").level).toBe("Youth");
    expect(guessEvent("TG outing").level).toBe("TG");
    expect(guessEvent("COW dinner").level).toBe("COW/Thirdspace");
    expect(guessEvent("Thirdspace jam").level).toBe("COW/Thirdspace");
    expect(guessEvent("Uni orientation").level).toBe("Uni");
    expect(guessEvent("Poly fun").level).toBe("Poly");
  });
  it("flags unknown levels without guessing", () => {
    const g = guessEvent("Staff lunch");
    expect(g.level).toBe("");
    expect(g.flags.map((f) => f.code)).toEqual(["level-unknown"]);
  });
  it("recognises gatherings and infers the type only when obvious", () => {
    expect(guessEvent("Gathering with Sam Lee")).toMatchObject({ eventType: "Gathering", gatheringType: "Gathering", preacher: "Sam Lee", level: "Gathering" });
    expect(guessEvent("Gathering").flags).toEqual([]);
    expect(guessEvent("Gathering YTH special").gatheringType).toBe("YTH Gathering");
    expect(guessEvent("Gathering Easter service").gatheringType).toBe("Easter/XMAS");
    const odd = guessEvent("Gathering recap and lunch");
    expect(odd.flags.map((f) => f.code)).toEqual(["gathering-type-unknown"]);
  });
});

describe("events", () => {
  it("builds a form-shaped row with times, duration and notes", () => {
    const e = classifyMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\nY. QT\nRoom 4\n09:00 - 10:30" } }]).events[0];
    expect(e).toMatchObject({
      name: "Y: QT",
      originalName: "Y. QT",
      date: "2026-03-03",
      event_time: "09:00:00",
      end_time: "10:30:00",
      duration_minutes: 90,
      level: "Youth",
      recurring: "None",
      pastoral_youth: true,
      event_type: "Event",
      notes: "Room 4",
      invalid: false,
      defaultSelected: true,
    });
    expect(e.key).toBe("event|2026-03-03|09:00:00|y: qt");
  });

  it("marks invalid and unselected rows", () => {
    const m = classifyMarch([{ monday: MARCH_WEEKS[1], events: { 1: "\n10:00 - 11:00", 2: "\nPlain thing" } }]);
    const noName = m.events.find((e) => e.name === "")!;
    expect(noName.invalid).toBe(true);
    expect(noName.defaultSelected).toBe(false);
    const noTime = m.events.find((e) => e.name === "Plain thing")!;
    expect(noTime.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["no-time", "level-unknown"]));
    expect(noTime.invalid).toBe(false);
    expect(noTime.event_time).toBeNull();
  });

  it("keeps keys unique for identical events and stable between runs", () => {
    const weeks = [{ monday: MARCH_WEEKS[1], events: { 1: "\nQT\n07:00 - 08:00\nQT\n07:00 - 08:00" } }];
    const a = classifyMarch(weeks).events.map((e) => e.key);
    const b = classifyMarch(weeks).events.map((e) => e.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
    expect(a[1]).toMatch(/#2$/);
  });

  it("drops a neighbouring month's copy but keeps unique overflow rows unselected", () => {
    const feb = monthSheet("Feb-26", 28, [
      { monday: "2026-01-26", events: { 0: "\nOnly in Feb sheet\n10:00 - 11:00" } },
      { monday: "2026-02-02" },
      { monday: "2026-02-09" },
      { monday: "2026-02-16" },
      { monday: "2026-02-23", events: { 6: "\nShared\n10:00 - 11:00" } },
    ]);
    const mar = monthSheet("Mar-26", 28, [{ monday: "2026-02-23", events: { 6: "\nShared\n10:00 - 11:00" } }]);
    const c = classifyWorkbook(parseCalendarWorkbook(workbook(feb, mar)));
    expect(c.events.filter((e) => e.name === "Shared")).toHaveLength(1);
    expect(c.duplicatesDropped).toBe(1);
    expect(c.events.find((e) => e.name === "Shared")!.defaultSelected).toBe(true);
    expect(c.events.find((e) => e.name === "Only in Feb sheet")!.defaultSelected).toBe(false);
  });
});

describe("seasons", () => {
  const seasonOf = (text: string, monday = "2026-03-02") => {
    const c = classifyWorkbook(parseCalendarWorkbook(workbook(monthSheet("Mar-26", 28, [{ monday, tagRows: 1, tags: [{ row: 0, col: 0, text, across: 6 }], events: { 1: "\nE\n10:00 - 11:00" } }]))));
    return c.seasons[0];
  };
  it("assigns categories", () => {
    expect(seasonOf("CYCLE 7 (2 MAR - 8 MAR)")).toMatchObject({ category: "Ministry Season", name: "Cycle 7" });
    expect(seasonOf("RF 2026 / 2027 (Dec - Feb)")).toMatchObject({ category: "Ministry Season", name: "RF 2026 / 2027" });
    expect(seasonOf("LBF")).toMatchObject({ category: "Ministry Season", name: "LBF" });
    expect(seasonOf("Pri / Sec / JC School Holidays")).toMatchObject({ category: "School Schedule", name: "Pri / Sec / JC School Holidays" });
    expect(seasonOf("Poly Examinations")).toMatchObject({ category: "Exam Period" });
    expect(seasonOf("POLY AND UNI HOLIDAYS")).toMatchObject({ category: "School Schedule", name: "Poly and Uni Holidays" });
  });
  it("sets Other with a flag for unknown tags and gives a palette colour", () => {
    const s = seasonOf("Mystery week");
    expect(s.category).toBe("Other");
    expect(s.flags.map((f) => f.code)).toContain("season-category-unknown");
    expect(SEASON_COLOR_KEYS).toContain(s.color);
  });
  it("leaves stale and mismatched seasons unselected", () => {
    const stale = seasonOf("RF 2023 / 2024 (Nov - Feb)");
    expect(stale.defaultSelected).toBe(false);
    const bad = seasonOf("CYCLE 7 (30 NOV - 31 DEC)");
    expect(bad.invalid).toBe(true);
    expect(bad.defaultSelected).toBe(false);
    expect(seasonOf("LBF").defaultSelected).toBe(true);
  });
  it("joins the same season seen on two neighbouring sheets", () => {
    const tag = (monday: string) => ({ monday, tagRows: 1, tags: [{ row: 0, col: 0, text: "Poly Examinations", across: 6 }], events: { 1: "\nE\n10:00 - 11:00" } });
    const feb = monthSheet("Feb-26", 28, [{ monday: "2026-01-26" }, { monday: "2026-02-02" }, { monday: "2026-02-09" }, { monday: "2026-02-16" }, tag("2026-02-23")]);
    const mar = monthSheet("Mar-26", 28, [tag("2026-02-23"), tag("2026-03-02")]);
    const c = classifyWorkbook(parseCalendarWorkbook(workbook(feb, mar)));
    expect(c.seasons).toHaveLength(1);
    expect(c.seasons[0]).toMatchObject({ start_date: "2026-02-23", end_date: "2026-03-08" });
    expect(c.seasons[0].key).toBe("season|poly examinations|Exam Period|2026-02-23|2026-03-08");
  });
});

describe("holidays and checklist", () => {
  it("turns observances into International Observance holidays and flags known public holidays", () => {
    const c = classifyMarch([{ monday: MARCH_WEEKS[1], obs: { 0: "World Book Day", 5: "Good Friday" } }]);
    const wbd = c.holidays.find((h) => h.name === "World Book Day")!;
    expect(wbd).toMatchObject({ type: "International Observance", date: "2026-03-02", defaultSelected: true, knownPublicHoliday: false });
    const gf = c.holidays.find((h) => h.name === "Good Friday")!;
    expect(gf.knownPublicHoliday).toBe(true);
    expect(gf.flags.map((f) => f.code)).toContain("known-public-holiday");
    expect(gf.defaultSelected).toBe(false);
  });

  it("maps checklist items to rows", () => {
    const sheet = makeSheet("Checklist", { A1: "Yearly", A2: "NO.", B2: "ITEM", C2: "DONE?", A3: 1, B3: "Prepare\nPoly\nUni", C3: 1, A4: 2, B4: "Book", C4: 0, A5: 3, B5: "Book" });
    const c = classifyWorkbook(parseCalendarWorkbook(workbook(sheet)));
    expect(c.checklist.map((r) => [r.category, r.item, r.status, r.notes, r.target_month])).toEqual([
      ["Yearly", "Prepare", "Done", "Poly; Uni", null],
      ["Yearly", "Book", "Not Started", "", null],
      ["Yearly", "Book", "Not Started", "", null],
    ]);
    expect(new Set(c.checklist.map((r) => r.key)).size).toBe(3);
  });
});

describe("whole result", () => {
  it("has unique keys across kinds and carries the document year", () => {
    const c = classifyMarch([{ monday: MARCH_WEEKS[1], obs: { 0: "Day A" }, tagRows: 1, tags: [{ row: 0, col: 0, text: "LBF", across: 6 }], events: { 1: "\nQT\n07:00 - 08:00", 2: "\nQT\n07:00 - 08:00" } }]);
    const keys = [...c.events, ...c.seasons, ...c.holidays, ...c.checklist].map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(c.docYear).toBe(2026);
    expect(ev("Y: x").source.sheet).toBe("Mar-26");
  });
});
