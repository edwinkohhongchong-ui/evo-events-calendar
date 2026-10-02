import { describe, it, expect } from "vitest";
import type { SeasonRow } from "../../types";
import { cleanNotes, cleanText, mergeNotes } from "../../schedules/text";
import { parseScheduleLines } from "../../schedules/parseSchedule";
import { classifySchedule } from "../../schedules/classify";
import { planDiff } from "../../schedules/diff";
import { buildSchedulePlan } from "../../schedules/planRows";
import { buildSelection, defaultSelection } from "../../schedules/selection";
import { validateSelection } from "../../schedules/applyValidation";
import { ImportLimitError, MAX_HOLIDAY_DAYS_PER_RANGE, MAX_PLAN_ROWS } from "../../schedules/limits";

describe("cleanText / cleanNotes", () => {
  it("removes control, zero-width and bidi-override characters and tidies spaces", () => {
    expect(cleanText("  a\u0000b​c‮d⁦e\u007ff﻿g⁠h  ")).toBe("abcdefgh");
    expect(cleanText("one\ttwo\nthree\r\nfour")).toBe("one two three four");
    expect(cleanText("plain – “text” é 日本")).toBe("plain – “text” é 日本");
  });
  it("cleanNotes keeps ordinary newlines but nothing else unsafe", () => {
    expect(cleanNotes("a\r\nb\u0000​\n\n\n\nc‮")).toBe("a\nb\n\nc");
  });
});

describe("mergeNotes (an import update never replaces hand-written notes)", () => {
  it("keeps existing notes when the document has none", () => {
    expect(mergeNotes("Mine", "")).toBe("Mine");
    expect(mergeNotes(null, "")).toBe("");
  });
  it("uses the document note when there is no existing one", () => {
    expect(mergeNotes("", "Tentative: x")).toBe("Tentative: x");
    expect(mergeNotes(null, "Tentative: x")).toBe("Tentative: x");
  });
  it("appends the document note on a new line, once", () => {
    expect(mergeNotes("Mine", "Tentative: x")).toBe("Mine\nTentative: x");
    expect(mergeNotes("Mine\nTentative: x", "Tentative: x")).toBe("Mine\nTentative: x");
  });
});

describe("notes in the import plan", () => {
  const AT = "2026-02-02T09:00:00+00:00";
  const ID = "22222222-2222-4222-8222-222222222222";
  const lines = ["Education Schedules 2026", "Secondary School", "N Level (tentative)", "Oral: 13 July 2026"];
  const existing = (notes: string | null): SeasonRow => ({
    id: ID,
    name: "N Level Oral",
    category: "Exam Period",
    start_date: "2026-07-13",
    end_date: "2026-07-13",
    notes,
    color: null,
    updated_at: AT,
  });
  const planFor = (notes: string | null) => {
    const parsed = parseScheduleLines(lines);
    return buildSchedulePlan(parsed, planDiff(classifySchedule(parsed), { holidays: [], seasons: [existing(notes)] }));
  };

  it("appends the document note after a different hand-written one and shows it as a visible change reason", () => {
    const row = planFor("Hall B booked").seasons[0];
    expect(row).toMatchObject({ status: "unchanged", notesDiffer: true, existingId: ID });
    expect(row.notes.startsWith("Hall B booked\nTentative:")).toBe(true);
    expect(row.changes).toEqual([{ field: "notes", from: "Hall B booked", to: row.notes }]);
  });

  it("is idempotent: once the document's note is already there, nothing differs", () => {
    const merged = planFor("Hall B booked").seasons[0].notes;
    const again = planFor(merged).seasons[0];
    expect(again).toMatchObject({ notesDiffer: false, notes: merged, changes: [] });
  });

  it("the merged note passes server validation as an update and carries the lock token", () => {
    const plan = planFor("Hall B booked");
    const sel = buildSelection(plan, new Set([plan.seasons[0].rowId]), {});
    expect(sel[0]).toMatchObject({ op: "update", id: ID, expectedUpdatedAt: AT });
    const r = validateSelection(sel);
    expect(r.ok && r.rows[0].values).toMatchObject({ notes: expect.stringMatching(/^Hall B booked\nTentative:/) });
    expect(defaultSelection(plan).size).toBe(0); // unchanged: not ticked by default
  });
});

describe("parse output hygiene", () => {
  it("cleans invisible characters out of names, notes and source text", () => {
    const parsed = parseScheduleLines([
      "Education Schedules 2026",
      "Public Holidays",
      "Labour​ Day‮: 1 May 2026",
    ]);
    const plan = classifySchedule(parsed);
    expect(plan.holidays[0].name).toBe("Labour Day");
    expect(parsed.items[0].sourceText).not.toMatch(/[​‮]/);
  });
});

describe("row caps", () => {
  it("refuses a holiday range longer than the per-range cap", () => {
    const p = parseScheduleLines(["Education Schedules 2026", "Public Holidays", "Odd Day: 1 January 2026 - 28 February 2026"]);
    expect(() => classifySchedule(p)).toThrow(ImportLimitError);
    expect(() => classifySchedule(p)).toThrow(new RegExp(`more than ${MAX_HOLIDAY_DAYS_PER_RANGE} days`));
  });
  it("accepts a holiday range at the cap", () => {
    const p = parseScheduleLines(["Education Schedules 2026", "Public Holidays", "Long Break: 1 January 2026 - 9 February 2026"]);
    expect(classifySchedule(p).holidays).toHaveLength(MAX_HOLIDAY_DAYS_PER_RANGE);
  });
  it("refuses a document that produces more rows than Apply can take, with a plain-language message", () => {
    const rows = Array.from({ length: MAX_PLAN_ROWS + 1 }, (_, i) => `Event ${i}: 1 January 2026`);
    const p = parseScheduleLines(["Education Schedules 2026", "Public Holidays", ...rows]);
    expect(() => classifySchedule(p)).toThrow(`This document produced more than ${MAX_PLAN_ROWS} rows; check it is the right file.`);
  });
});
