import { describe, it, expect } from "vitest";
import type { CalHoliday } from "../../schedules/holidayCheck";
import { checkHolidays, copyText, holidayKey, summaryLine } from "../../schedules/holidayCheck";
import { nationalHolidays } from "../../calendarificApi";
import { DOC_HOLIDAYS_2026, SG_2026 } from "../fixtures/calendarificSg2026";

const cal = nationalHolidays(SG_2026);
const run = (planned: { rowId: string; name: string; start: string }[], list: CalHoliday[] = cal, loadedYears = [2026], listYear: number | null = 2026) =>
  checkHolidays(planned, list, { loadedYears, listYear });
const one = (name: string, start: string, list: CalHoliday[] = cal) => run([{ rowId: "r", name, start }], list).rows[0];

describe("holidayKey aliases", () => {
  it.each([
    ["Hari Raya Puasa", "Eid al-Fitr"],
    ["Hari Raya Puasa", "Hari Raya Aidilfitri"],
    ["Hari Raya Haji", "Eid al-Adha"],
    ["Hari Raya Haji", "Hari Raya Aidiladha"],
    ["Chinese New Year (Day 1)", "Chinese New Year Holiday"],
    ["Chinese New Year (Day 2)", "Lunar New Year"],
    ["Vesak Day", "Wesak Day"],
    ["Deepavali", "Diwali"],
    ["Labour Day", "Labor Day"],
    ["Christmas", "Christmas Day"],
    ["New Year’s Day", "New Year's Day"],
    ["National Day (In-Lieu)", "National Day"],
  ])("%s equals %s", (a, b) => expect(holidayKey(a)).toBe(holidayKey(b)));

  it("keeps different holidays apart", () => {
    expect(holidayKey("Good Friday")).not.toBe(holidayKey("Labour Day"));
    expect(holidayKey("Chinese New Year")).not.toBe(holidayKey("New Year's Day"));
    expect(holidayKey("Hari Raya Puasa")).not.toBe(holidayKey("Hari Raya Haji"));
  });
});

describe("Singapore 2026 fixture vs the real document's 14 holidays", () => {
  const { rows, notInDocument } = run(DOC_HOLIDAYS_2026);

  it("every holiday matches, including the in-lieu Mondays Calendarific lists", () => {
    expect(rows.map((r) => r.result)).toEqual(Array(14).fill("match"));
    expect(summaryLine(rows)).toBe("Holiday check (Calendarific): 14 match, 0 differ, 0 not found");
  });

  it("lists nothing missing from the document, and never lists observances", () => {
    expect(notInDocument).toEqual([]);
  });

  it("Chinese New Year Day 2 matches its own day, not Day 1", () => {
    expect(rows[2]).toMatchObject({ result: "match", calendarificDate: "2026-02-18" });
  });
});

describe("result types", () => {
  it("match carries the Calendarific name and date", () => {
    expect(one("Hari Raya Puasa", "2026-03-21")).toMatchObject({ result: "match", calendarificName: "Hari Raya Puasa", calendarificDate: "2026-03-21" });
  });

  it("date-differs: same holiday, different date (moon sighting), mentions the hint", () => {
    const r = one("Hari Raya Puasa", "2026-03-20");
    expect(r).toMatchObject({ result: "date-differs", calendarificDate: "2026-03-21" });
    expect(r.detail).toMatch(/moon-sighting/i);
    expect(one("Labour Day", "2026-05-02")).toMatchObject({ result: "date-differs", calendarificDate: "2026-05-01" });
    expect(one("Labour Day", "2026-05-02").detail).not.toMatch(/moon/i);
  });

  it("date-differs picks the nearest and ignores a same-named date far away", () => {
    expect(one("Good Friday", "2026-10-10").result).toBe("not-found");
  });

  it("not-found: nothing with that name or date", () => {
    expect(one("Founders' Day", "2026-07-07")).toMatchObject({ result: "not-found" });
    expect(one("Founders' Day", "2026-07-07").calendarificName).toBeUndefined();
  });

  it("not-found names the other holiday when Calendarific lists a different one that day", () => {
    const r = one("Founders' Day", "2026-12-25");
    expect(r).toMatchObject({ result: "not-found", calendarificName: "Christmas Day" });
  });

  it("n/a for a holiday in a year Calendarific data was not loaded for", () => {
    const r = run([{ rowId: "r", name: "New Year's Day", start: "2027-01-01" }]).rows[0];
    expect(r.result).toBe("n/a");
    expect(r.detail).toMatch(/2027/);
  });
});

describe("in-lieu rows", () => {
  const withoutMondays = cal.filter((h) => !/observed/i.test(h.name));

  it("match when Calendarific lists the observed Monday (any naming)", () => {
    expect(one("Vesak Day (In-Lieu)", "2026-06-01")).toMatchObject({ result: "match", calendarificName: "Vesak Day (Observed)" });
  });

  it("are n/a, never an error, when Calendarific does not list the Monday", () => {
    const r = one("National Day (In-Lieu)", "2026-08-10", withoutMondays);
    expect(r.result).toBe("n/a");
    expect(r.detail).toMatch(/not listed|does not list/i);
  });

  it("the base holiday is still compared on its own row", () => {
    const rows = run(
      [
        { rowId: "a", name: "National Day", start: "2026-08-09" },
        { rowId: "b", name: "National Day (In-Lieu)", start: "2026-08-10" },
      ],
      withoutMondays
    ).rows;
    expect(rows.map((r) => r.result)).toEqual(["match", "n/a"]);
  });

  it("an unlisted Calendarific Monday is reported missing only when no in-lieu row covers it", () => {
    const missing = run(DOC_HOLIDAYS_2026.filter((h) => !h.name.includes("In-Lieu"))).notInDocument;
    expect(missing.map((m) => m.date)).toEqual(["2026-06-01", "2026-08-10", "2026-11-09"]);
  });
});

describe("notInDocument", () => {
  it("lists national holidays no row covers, in date order", () => {
    const planned = DOC_HOLIDAYS_2026.filter((h) => !["h6", "h14"].includes(h.rowId));
    expect(run(planned).notInDocument).toEqual([
      { date: "2026-05-01", name: "Labour Day" },
      { date: "2026-12-25", name: "Christmas Day" },
    ]);
  });

  it("does not list a holiday that a date-differs row already points at", () => {
    const r = run([{ rowId: "r", name: "Hari Raya Puasa", start: "2026-03-20" }]);
    expect(r.notInDocument.some((m) => m.name === "Hari Raya Puasa")).toBe(false);
  });

  it("only lists the document's year at the year boundary", () => {
    const next = [{ date: "2027-01-01", name: "New Year's Day", description: "", type: ["National holiday"] }];
    const out = run([{ rowId: "r", name: "New Year's Day", start: "2026-01-01" }], [...cal, ...next], [2026, 2027]);
    expect(out.notInDocument.some((m) => m.date.startsWith("2027"))).toBe(false);
  });

  it("a holiday in the next year is checked against the next year's list", () => {
    const next = [{ date: "2027-01-01T00:00:00+08:00", name: "New Year's Day" }];
    const out = run([{ rowId: "r", name: "New Year's Day", start: "2027-01-01" }], [...cal, ...next], [2026, 2027]);
    expect(out.rows[0].result).toBe("match");
  });
});

describe("copyText", () => {
  it("is short and plain for each result", () => {
    expect(copyText(undefined)).toBe("");
    expect(copyText(one("Labour Day", "2026-05-01"))).toBe("Calendarific: match");
    expect(copyText(one("Labour Day", "2026-05-02"))).toBe("Calendarific: differs (Labour Day on 2026-05-01)");
    expect(copyText(one("Founders' Day", "2026-07-07"))).toBe("Calendarific: not found");
    expect(copyText({ rowId: "x", result: "n/a", detail: "" })).toBe("Calendarific: not checked");
  });
});

describe("copy list for web check", () => {
  it("adds a Calendarific column to holidays only, and marks an edited row as not rechecked", async () => {
    const { copyListText } = await import("../../schedules/selection");
    const row = (rowId: string, name: string, start: string) => ({ rowId, kind: "holiday", name, start, end: start, tentative: false }) as never;
    const plan = {
      holidays: [row("a", "Labour Day", "2026-05-01"), row("b", "Labour Day", "2026-05-02")],
      seasons: [{ rowId: "s", kind: "season", name: "Term 1", start: "2026-01-01", end: "2026-03-01", tentative: false }],
      holidayCheck: { status: "ok", source: "Calendarific", notInDocument: [], rows: run([{ rowId: "a", name: "Labour Day", start: "2026-05-01" }, { rowId: "b", name: "Labour Day", start: "2026-05-02" }]).rows },
    } as never;
    const drafts = { b: { name: "Labour Day", category: "", start: "2026-05-03", end: "2026-05-03", notes: "" } };
    expect(copyListText(plan, new Set(["a", "b", "s"]), drafts).split("\n")).toEqual([
      "Holidays | Labour Day | 2026-05-01 |  | Calendarific: match",
      "Holidays | Labour Day | 2026-05-03 |  | Calendarific: not rechecked (edited)",
      "Seasons | Term 1 | 2026-01-01 - 2026-03-01 | ",
    ]);
  });
});
