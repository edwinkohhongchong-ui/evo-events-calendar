import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { classifySchedule } from "../../schedules/classify";

const lines = readFileSync(join(__dirname, "../fixtures/education-schedules-2026.txt"), "utf8").split("\n");
const parsed = parseScheduleLines(lines);
const planned = classifySchedule(parsed);

const season = (name: string) => planned.seasons.filter((s) => s.name === name);
const ranges = (name: string) => season(name).map((s) => `${s.start_date}..${s.end_date}`);
const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

describe("real 2026 education-schedules document", () => {
  it("detects the year and keeps every date row", () => {
    expect(parsed.title).toBe("Education Schedules 2026");
    expect(parsed.docYear).toBe(2026);
    expect(parsed.items).toHaveLength(93);
    expect(parsed.issues).toEqual([]);
    // Footnotes with no dates are kept for display, not dropped.
    expect(parsed.ignoredLines.map((l) => l.line)).toEqual([19, 30, 45]);
  });

  it("plans 14 holidays and 82 seasons", () => {
    expect(planned.holidays).toHaveLength(14);
    expect(planned.seasons).toHaveLength(82);
    const byCat = (c: string) => planned.seasons.filter((s) => s.category === c).length;
    expect(byCat("School Schedule")).toBe(44);
    expect(byCat("Exam Period")).toBe(38);
  });

  describe("holidays", () => {
    const h = (date: string) => planned.holidays.find((x) => x.date === date);
    it("expands Chinese New Year to one holiday per day", () => {
      expect(h("2026-02-17")?.name).toBe("Chinese New Year (Day 1)");
      expect(h("2026-02-18")?.name).toBe("Chinese New Year (Day 2)");
    });
    it("adds the observed Monday after each Sunday holiday", () => {
      expect(h("2026-05-31")?.name).toBe("Vesak Day");
      expect(h("2026-06-01")?.name).toBe("Vesak Day (In-Lieu)");
      expect(h("2026-08-09")?.name).toBe("National Day");
      expect(h("2026-08-10")?.name).toBe("National Day (In-Lieu)");
      expect(h("2026-11-08")?.name).toBe("Deepavali");
      expect(h("2026-11-09")?.name).toBe("Deepavali (In-Lieu)");
    });
    it("marks Hari Raya Puasa and Haji tentative by the provisional type only (no name suffix)", () => {
      expect(h("2026-03-21")?.name).toBe("Hari Raya Puasa");
      expect(h("2026-05-27")?.name).toBe("Hari Raya Haji");
      for (const d of ["2026-03-21", "2026-05-27"]) {
        expect(h(d)?.name).not.toMatch(/tentative/i);
        expect(h(d)?.type).toBe("National (SG Public Holiday, provisional)");
        expect(h(d)?.tentative).toBe(true);
      }
    });
    it("uses the app's existing names and types", () => {
      expect(h("2026-12-25")?.name).toBe("Christmas Day");
      expect(h("2026-01-01")?.name).toBe("New Year's Day");
      expect(h("2026-04-03")).toMatchObject({ name: "Good Friday", type: "National (SG Public Holiday)" });
    });
    it("gives every record a unique key", () => {
      const keys = [...planned.holidays, ...planned.seasons].map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("school holidays", () => {
    const holidayRanges = (prefix: string) =>
      planned.seasons.filter((s) => s.name.startsWith(prefix)).map((s) => `${s.name} ${s.start_date}..${s.end_date}`);
    it("Primary has 4 ranges named by month, including the one into 2027", () => {
      expect(holidayRanges("Primary School Holidays")).toEqual([
        "Primary School Holidays (March) 2026-03-14..2026-03-22",
        "Primary School Holidays (June) 2026-05-30..2026-06-28", // 2 days in May, 28 in June
        "Primary School Holidays (September) 2026-09-05..2026-09-13",
        "Primary School Holidays (November-December) 2026-11-21..2027-01-02",
      ]);
    });
    it("Secondary and JC are named separately and by month too; JC ends the year a week later", () => {
      expect(holidayRanges("Secondary School Holidays")).toHaveLength(4);
      expect(holidayRanges("Secondary School Holidays")[3]).toContain("(November-December)");
      expect(holidayRanges("JC Holidays")).toEqual([
        "JC Holidays (March) 2026-03-14..2026-03-22",
        "JC Holidays (June) 2026-05-30..2026-06-28",
        "JC Holidays (September) 2026-09-05..2026-09-13",
        "JC Holidays (November-December) 2026-11-28..2027-01-02",
      ]);
      expect(season("JC Holidays (March)")[0].category).toBe("School Schedule");
    });
  });

  describe("MOE exams", () => {
    it("PSLE", () => {
      expect(ranges("PSLE Oral")).toEqual(["2026-08-12..2026-08-13"]); // two single days merged
      expect(ranges("PSLE Written Exams")).toEqual(["2026-09-24..2026-10-01"]);
      const oral = season("PSLE Oral")[0];
      expect(oral.category).toBe("Exam Period");
      expect(oral.tentative).toBe(true);
      expect(oral.notes).toMatch(/^Tentative: will be available by 24 March 2026/);
    });
    it("O Level oral has two non-adjacent periods", () => {
      expect(ranges("O Level Oral")).toEqual(["2026-07-14..2026-07-17", "2026-09-24..2026-09-24"]);
      expect(ranges("O Level Written")).toEqual(["2026-10-14..2026-11-09"]);
    });
    it("N Level written has two ranges", () => {
      expect(ranges("N Level Written")).toEqual(["2026-09-15..2026-09-22", "2026-10-06..2026-10-14"]);
    });
    it("A Level written: the year typo is flagged as an error, not corrected", () => {
      const [bad, good] = season("A Level Written");
      expect(bad.start_date).toBe("2026-10-14");
      expect(bad.end_date).toBe("2025-10-21");
      expect(codes(bad.flags)).toEqual(expect.arrayContaining(["end-before-start", "year-mismatch", "tentative"]));
      expect(bad.invalid).toBe(true);
      expect(bad.notes).toContain("Science Practicals");
      expect(good.invalid).toBe(false);
      expect(good.start_date).toBe("2026-10-27"); // the wrapped continuation line
    });
  });

  describe("polytechnic", () => {
    it("keeps NP/TP/NYP rows with their notes", () => {
      const exam = planned.seasons.find((s) => s.start_date === "2026-02-16");
      expect(exam).toMatchObject({ name: "Poly Examinations (NP, TP, NYP)", category: "Exam Period" });
      expect(exam?.notes).toBe("NP ends earlier at 1 March 2026");
      expect(season("Poly Holidays (NP, TP, NYP)")).toHaveLength(4);
    });
    it("separates SP from RP", () => {
      expect(ranges("Poly Mid Semester Test (SP)")).toEqual(["2026-06-01..2026-06-05"]);
      expect(ranges("Poly Mid Semester Test (SP, RP)")).toEqual(["2026-12-07..2026-12-11"]);
      expect(ranges("Poly Mid Semester Test (RP)")).toEqual(["2025-06-09..2025-06-15"]);
      expect(ranges("Poly Examinations (SP)")).toEqual(["2026-08-24..2026-09-04"]);
      expect(ranges("Poly Examinations (RP)")).toEqual(["2025-08-18..2025-09-02"]);
    });
    it("flags every RP row dated 2025", () => {
      const rp2025 = planned.seasons.filter((s) => s.name.endsWith("(RP)"));
      expect(rp2025).toHaveLength(3);
      for (const s of rp2025) expect(codes(s.flags)).toContain("year-mismatch");
    });
    it("applies unlabelled rows after RP's cut-off to BOTH SP and RP, still flagged not-published", () => {
      const notPublished = planned.seasons.filter((s) => codes(s.flags).includes("not-published"));
      expect(notPublished.map((s) => s.start_date)).toEqual([
        "2026-04-20", "2026-09-05", "2026-10-19", "2026-12-07", "2026-12-12",
      ]);
      expect(notPublished.every((s) => s.name.endsWith("(SP, RP)"))).toBe(true);
    });
    it("semester week-1 markers are single-day School Schedule rows without the label's stray year", () => {
      const w = planned.seasons.find((s) => s.start_date === "2026-01-05" && s.name.includes("NP"));
      expect(w).toMatchObject({ name: "Poly 1st Week of Semester 2 (NP, TP, NYP)", end_date: "2026-01-05", category: "School Schedule" });
      expect(planned.seasons.some((s) => /\b20\d\d\b/.test(s.name))).toBe(false);
    });
  });

  describe("university", () => {
    it("NUS rows", () => {
      expect(ranges("NUS Recess Week")).toEqual(["2026-02-21..2026-03-01", "2026-09-19..2026-09-27"]);
      expect(ranges("NUS Reading Week")).toEqual(["2026-04-18..2026-04-24", "2026-11-14..2026-11-20"]);
      expect(ranges("NUS Examination")).toEqual(["2026-04-25..2026-05-09", "2026-11-21..2026-12-05"]);
      expect(season("NUS Reading Week")[0].category).toBe("Exam Period");
      expect(season("NUS Recess Week")[0].category).toBe("School Schedule");
      expect(season("NUS Orientation")[0].category).toBe("School Schedule");
    });
    it("NTU and SMU rows", () => {
      expect(ranges("NTU Recess Week")).toEqual(["2026-03-02..2026-03-08", "2026-09-26..2026-10-04"]);
      expect(ranges("NTU Revision and Examination")).toEqual(["2026-04-20..2026-05-08", "2026-11-14..2026-12-04"]);
      expect(ranges("SMU Recess Week")).toEqual(["2026-03-02..2026-03-08", "2026-10-05..2026-10-11"]);
      expect(ranges("SMU Revision and Examination")).toEqual(["2026-04-20..2026-05-03", "2026-11-23..2026-12-06"]);
      expect(ranges("SMU Orientation")).toEqual(["2026-08-10..2026-08-16"]);
    });
    it("mid-term guidance windows are kept as tentative Exam Periods but default to unticked", () => {
      const mt = season("NTU Mid-terms");
      expect(mt).toHaveLength(2);
      expect(mt[0].tentative).toBe(true);
      expect(mt[0].category).toBe("Exam Period");
      const all = planned.seasons.filter((s) => s.name.endsWith("Mid-terms"));
      expect(all).toHaveLength(5);
      expect(all.every((s) => s.defaultSelected === false)).toBe(true);
      expect(planned.seasons.filter((s) => s.defaultSelected === false)).toHaveLength(5);
      expect(mt[0].notes).toMatch(/expected window/);
    });
    it("NTU's 2024 label typo does not produce any flag", () => {
      const w = planned.seasons.find((s) => s.name === "NTU 1st Week of Semester 2");
      expect(w?.flags).toEqual([]);
    });
  });

  it("raises flags only where expected", () => {
    const flagged = [...planned.holidays, ...planned.seasons].filter((r) => r.flags.length > 0);
    const tally: Record<string, number> = {};
    for (const r of flagged) for (const f of r.flags) tally[f.code] = (tally[f.code] ?? 0) + 1;
    expect(tally).toEqual({
      tentative: 24, // 2 holidays + PSLE 3 + N 4 + O 5 + A 5 + mid-term windows 5
      "end-before-start": 1,
      "year-mismatch": 4,
      "not-published": 5,
    });
    // No error flag outside the one A Level typo.
    const errors = [...planned.holidays, ...planned.seasons].filter((r) => r.invalid);
    expect(errors).toHaveLength(1);
  });
});
