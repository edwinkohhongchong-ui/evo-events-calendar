import { describe, it, expect } from "vitest";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { scanTokens } from "../../schedules/dateText";

const wrap = (...rows: string[]) => ["Education Schedules 2026", "Public Holidays", ...rows];
const one = (row: string, headings: string[] = []) =>
  parseScheduleLines(["Education Schedules 2026", "Public Holidays", ...headings, row]).items;

describe("date formats", () => {
  it("single day", () => {
    const [i] = one("Labour Day: 1 May 2026");
    expect([i.start, i.end]).toEqual(["2026-05-01", "2026-05-01"]);
  });
  it.each([
    ["hyphen with spaces", "A: 14 March 2026 - 22 March 2026"],
    ["en dash", "A: 14 March 2026 – 22 March 2026"],
    ["em dash", "A: 14 March 2026 — 22 March 2026"],
    ["no spaces", "A: 14 March 2026-22 March 2026"],
  ])("range: %s", (_n, row) => {
    const [i] = one(row);
    expect([i.start, i.end]).toEqual(["2026-03-14", "2026-03-22"]);
  });
  it("shorthand range with shared month and year", () => {
    const [i] = one("Chinese New Year: 17 - 18 February 2026");
    expect([i.start, i.end]).toEqual(["2026-02-17", "2026-02-18"]);
  });
  it("shorthand range that crosses a year", () => {
    const [i] = one("Break: 21 December - 4 January 2027");
    expect([i.start, i.end]).toEqual(["2026-12-21", "2027-01-04"]);
  });
  it("range crossing into the next year", () => {
    const [i] = one("Break: 21 November 2026 - 2 January 2027");
    expect([i.start, i.end]).toEqual(["2026-11-21", "2027-01-02"]);
    expect(i.flags.map((f) => f.code)).not.toContain("year-mismatch");
  });
  it("lists joined by 'and'", () => {
    const items = one("Oral: 12 August 2026 and 13 August 2026");
    expect(items.map((i) => i.start)).toEqual(["2026-08-12", "2026-08-13"]);
  });
  it("lists joined by commas, mixing ranges and single days", () => {
    const items = one("Oral: 14 July 2026 - 17 July 2026, 24 September 2026");
    expect(items.map((i) => [i.start, i.end])).toEqual([
      ["2026-07-14", "2026-07-17"],
      ["2026-09-24", "2026-09-24"],
    ]);
  });
  it("abbreviated and upper-case month names", () => {
    const [i] = one("A: 1 Sept 2026 - 5 SEP 2026");
    expect([i.start, i.end]).toEqual(["2026-09-01", "2026-09-05"]);
  });
  it("rejects impossible dates with an error flag instead of guessing", () => {
    const r = parseScheduleLines(wrap("A: 31 February 2026"));
    expect(r.items).toHaveLength(0);
    expect(r.issues.map((f) => [f.code, f.severity, f.row])).toEqual([["invalid-date", "error", 3]]);
    expect(scanTokens("31 February 2026")[0].kind).toBe("invalid");
  });
  it("leap day is valid only in leap years", () => {
    expect(scanTokens("29 February 2028")[0].kind).toBe("single");
    expect(scanTokens("29 February 2026")[0].kind).toBe("invalid");
  });
});

describe("wrapped lines", () => {
  it("joins a trailing-comma line with the next paragraph", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Junior College",
      "A Level",
      "Written: 14 October 2026 - 21 October 2026 (Science Practicals),",
      "27 October 2026 - 26 November 2026",
    ]);
    expect(r.items.map((i) => [i.start, i.end])).toEqual([
      ["2026-10-14", "2026-10-21"],
      ["2026-10-27", "2026-11-26"],
    ]);
    expect(r.items.every((i) => i.sourceLine === 4)).toBe(true);
    expect(r.items[0].notes).toEqual(["Science Practicals"]);
    expect(r.ignoredLines).toHaveLength(0);
  });
  it("joins wrapped per-institution lists", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Polytechnic",
      "SP, RP:",
      "Examination: 24 August 2026 - 4 September 2026 (SP),",
      "18 August 2026 - 2 September 2026 (RP)",
    ]);
    expect(r.items.map((i) => i.institutions)).toEqual([["SP"], ["RP"]]);
  });
});

describe("tentative detection", () => {
  it.each(["(subject to confirmation)", "(tentative)", "(will be available by 3 March 2026)"])("row note %s", (note) => {
    const [i] = one(`Hari Raya Puasa: 21 March 2026 ${note}`);
    expect(i.tentative).toBe(true);
    expect(i.flags.map((f) => f.code)).toContain("tentative");
  });
  it("group heading makes every row under it tentative, and records the wording", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Secondary School",
      "N Level (tentative - will be available by 3 March 2026)",
      "Oral: 13 July 2026 - 17 July 2026",
    ]);
    expect(r.items[0].tentative).toBe(true);
    expect(r.items[0].tentativeText).toBe("will be available by 3 March 2026");
    expect(r.items[0].group).toBe("N Level");
    expect(r.items).toHaveLength(1); // the date in the heading is not an item
  });
  it("a plain row is not tentative", () => {
    expect(one("Labour Day: 1 May 2026")[0].tentative).toBe(false);
  });
});

describe("notes, Sunday rule, institutions", () => {
  it("captures the observed holiday date", () => {
    const [i] = one("Vesak Day: 31 May 2026 (this is a Sunday, 1 June 2026 will be PH)");
    expect(i.observedDate).toBe("2026-06-01");
    expect(i.flags.map((f) => f.code)).not.toContain("sunday-mismatch");
  });
  it("flags a Sunday claim on a date that is not a Sunday", () => {
    const [i] = one("X Day: 30 May 2026 (this is a Sunday, 31 May 2026 will be PH)");
    expect(i.flags.map((f) => f.code)).toContain("sunday-mismatch");
  });
  it("splits an SP/RP line into one item per institution", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Polytechnic",
      "SP, RP:",
      "Mid Semester Test: 1 June 2026 - 5 June 2026 (SP), 9 June 2025 - 15 June 2025 (RP)",
    ]);
    expect(r.items.map((i) => [i.institutions, i.start])).toEqual([
      [["SP"], "2026-06-01"],
      [["RP"], "2025-06-09"],
    ]);
  });
  it("keeps parenthetical notes with the dates they follow", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Polytechnic",
      "NP, TP, NYP:",
      "Examination: 16 February 2026 - 8 March 2026 (NP ends earlier at 1 March 2026)",
    ]);
    expect(r.items[0].notes).toEqual(["NP ends earlier at 1 March 2026"]);
    expect(r.items[0].institutions).toEqual(["NP", "TP", "NYP"]);
  });
  it("RP unpublished note: later unlabelled rows are SP only and flagged", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Polytechnic",
      "SP, RP: (weird, RP didn’t yet publish April 2026 onwards)",
      "Vacation: 7 March 2026 - 19 April 2026",
      "Vacation: 5 September 2026 - 18 October 2026",
    ]);
    expect(r.items[0].institutions).toEqual(["SP", "RP"]);
    expect(r.items[1].institutions).toEqual(["SP"]);
    expect(r.items[1].flags.map((f) => f.code)).toContain("not-published");
    expect(r.items[0].flags.map((f) => f.code)).not.toContain("not-published");
  });
  it("label prefixes keep their wording but never trigger a year flag on their own", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Polytechnic",
      "NP, TP, NYP:",
      "1st week of 2025 Semester 2: 5 January 2026",
    ]);
    expect(r.items[0].label).toBe("1st week of 2025 Semester 2");
    expect(r.items[0].flags).toHaveLength(0);
  });
});

describe("year handling and flags", () => {
  it("reads the document year from the title", () => {
    expect(parseScheduleLines(["Education Schedules 2031", "Public Holidays", "A: 1 May 2031"]).docYear).toBe(2031);
  });
  it("falls back to the most common date year, then defaultYear", () => {
    const r = parseScheduleLines(["Public Holidays", "A: 1 May 2027", "B: 2 May 2027", "C: 3 May 2026"]);
    expect(r.title).toBeNull();
    expect(r.docYear).toBe(2027);
    expect(parseScheduleLines(["hello"], { defaultYear: 2030 }).docYear).toBe(2030);
    expect(parseScheduleLines(["hello"]).docYear).toBeNull();
  });
  it("end before start is an error and is not silently corrected", () => {
    const [i] = one("Written: 14 October 2026 - 21 October 2025");
    const f = i.flags.find((x) => x.code === "end-before-start");
    expect(f?.severity).toBe("error");
    expect(i.end).toBe("2025-10-21");
  });
  it("flags dates in the wrong year", () => {
    const [i] = one("Vacation: 30 June 2025 - 10 August 2025");
    expect(i.flags.find((f) => f.code === "year-mismatch")?.severity).toBe("warn");
    const [far] = one("Vacation: 30 June 2022 - 10 August 2022");
    expect(far.flags.find((f) => f.code === "year-mismatch")?.severity).toBe("error");
  });
  it("does not flag a range running into next year", () => {
    expect(one("Vacation: 12 December 2026 - 4 January 2027")[0].flags).toHaveLength(0);
  });
  it("flags unrecognised labels but keeps the row under the current group", () => {
    const r = parseScheduleLines(["Education Schedules 2026", "University", "NUS", "Frobnication: 1 May 2026"]);
    expect(r.items[0].group).toBe("NUS");
    expect(r.items[0].flags.map((f) => f.code)).toContain("unrecognised-label");
  });
  it("lines without dates or headings are ignored but kept", () => {
    const r = parseScheduleLines([
      "Education Schedules 2026",
      "Primary School",
      "*School exams tend to start about 2 weeks before school holidays.",
    ]);
    expect(r.ignoredLines).toEqual([{ line: 3, text: "*School exams tend to start about 2 weeks before school holidays." }]);
  });
  it("recognises headings case-insensitively and with a small typo", () => {
    const r = parseScheduleLines(["education schedules 2026", "PRIMARY SCHOOL", "School Holiday", "14 March 2026 - 22 March 2026", "Polytechnc", "NP:", "Vacation: 9 March 2026 - 19 April 2026"]);
    expect(r.items[0]).toMatchObject({ section: "Primary School", group: "School Holidays" });
    expect(r.items[1]).toMatchObject({ section: "Polytechnic", group: "NP" });
  });
  it("does not fuzz N Level into O Level", () => {
    const r = parseScheduleLines(["Education Schedules 2026", "Secondary School", "N Level", "Oral: 1 May 2026", "O Level", "Oral: 2 May 2026"]);
    expect(r.items.map((i) => i.group)).toEqual(["N Level", "O Level"]);
  });
  it("normalises curly apostrophes and non-breaking spaces", () => {
    const [i] = one("New Year’s Day: 1 January 2026");
    expect(i.label).toBe("New Year's Day");
  });
});
