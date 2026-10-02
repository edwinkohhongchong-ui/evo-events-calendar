import { describe, it, expect, vi } from "vitest";
import { earliestDate, runImport, seasonWriteValues, type ImportWriters } from "../../schedules/applyRunner";
import { describeApply, validateSelection, type CleanImportRow, type ImportRowInput } from "../../schedules/applyValidation";
import { RowConflictError } from "../../rowConflict";
import { suggestSeasonColor } from "../../seasonColor";

const clean = (rows: ImportRowInput[]): CleanImportRow[] => {
  const r = validateSelection(rows);
  if (!r.ok) throw new Error(r.error);
  return r.rows;
};
const S = (name: string, over: Partial<ImportRowInput> = {}): ImportRowInput => ({
  kind: "season",
  op: "create",
  values: { name, category: "Exam Period", start: "2026-03-01", end: "2026-03-05", notes: "" },
  ...over,
});
const H = (name: string, over: Partial<ImportRowInput> = {}): ImportRowInput => ({
  kind: "holiday",
  op: "create",
  values: { name, category: "Custom", start: "2026-05-01" },
  ...over,
});

const SID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AT = "2026-03-01T10:00:00.5+00:00";

function writers(failOn?: string): ImportWriters & { calls: string[] } {
  const calls: string[] = [];
  const w: ImportWriters & { calls: string[] } = {
    calls,
    async insertSeason(v) {
      calls.push(`insertSeason:${v.name}`);
      if (v.name === failOn) throw new Error("Something went wrong saving this season.");
      return { id: `s-${v.name}`, affected: [{ table: "seasons", id: `s-${v.name}`, before: null, after: { ...v } }] };
    },
    async updateSeason(id, v, at) {
      calls.push(`updateSeason:${id}@${at}`);
      return [{ table: "seasons", id, before: { id }, after: { id, ...v } }];
    },
    async insertHoliday(v) {
      calls.push(`insertHoliday:${v.name}`);
      return { id: `h-${v.name}`, affected: [{ table: "holidays", id: `h-${v.name}`, before: null, after: { ...v } }] };
    },
    async updateHoliday(id, v, at) {
      calls.push(`updateHoliday:${id}@${at}`);
      return [{ table: "holidays", id, before: { id }, after: { id, ...v } }];
    },
  };
  return w;
}

describe("runImport", () => {
  it("routes create vs update to the right writer, in order, and collects every affected row", async () => {
    const w = writers();
    const out = await runImport(
      clean([S("A"), S("B", { op: "update", id: SID, expectedUpdatedAt: AT }), H("C"), H("D", { op: "update", id: HID, expectedUpdatedAt: AT })]),
      w
    );
    expect(w.calls).toEqual(["insertSeason:A", `updateSeason:${SID}@${AT}`, "insertHoliday:C", `updateHoliday:${HID}@${AT}`]);
    expect(out.summary).toEqual({ holidaysAdded: 1, holidaysUpdated: 1, seasonsAdded: 1, seasonsUpdated: 1, failed: null, notAttempted: 0 });
    expect(out.affected.map((a) => a.table)).toEqual(["seasons", "seasons", "holidays", "holidays"]);
  });

  it("stops at the first failure, keeps what was saved, and reports the row in plain language", async () => {
    const w = writers("C");
    const out = await runImport(clean([S("A"), S("B"), S("C"), S("D"), S("E")]), w);
    expect(w.calls).toEqual(["insertSeason:A", "insertSeason:B", "insertSeason:C"]);
    expect(out.affected.map((a) => a.id)).toEqual(["s-A", "s-B"]);
    expect(out.summary).toMatchObject({
      seasonsAdded: 2,
      failed: { row: 3, name: "C", message: "Something went wrong saving this season." },
      notAttempted: 2,
    });
  });

  it("reports an update whose row changed since it was read as a plain-language row failure", async () => {
    const w = writers();
    w.updateSeason = vi.fn().mockRejectedValue(new RowConflictError());
    const out = await runImport(clean([S("A"), S("B", { op: "update", id: SID, expectedUpdatedAt: AT }), S("C")]), w);
    expect(out.summary.failed).toEqual({
      row: 2,
      name: "B",
      message: "Changed by someone else since you read the document. Read the document again.",
    });
    expect(out.summary).toMatchObject({ seasonsAdded: 1, notAttempted: 1 });
    expect(describeApply(out.summary)).toContain('Stopped at row 2 ("B"): Changed by someone else since you read the document.');
  });

  it("never leaks database wording from a failure", async () => {
    const w = writers();
    w.insertSeason = vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint "seasons_pkey"'));
    const out = await runImport(clean([S("A")]), w);
    expect(out.summary.failed?.message).toBe("Something went wrong. Please try again.");
  });
});

describe("seasonWriteValues", () => {
  const row = (r: ImportRowInput) => clean([r])[0] as Extract<CleanImportRow, { kind: "season" }>;
  it("gives a created season the suggested colour unless one was sent", () => {
    expect(seasonWriteValues(row(S("NUS Recess Week"))).color).toBe(suggestSeasonColor("NUS Recess Week"));
    expect(seasonWriteValues(row(S("X", { values: { ...S("X").values, color: "#ABCDEF" } }))).color).toBe("#abcdef");
  });
  it("leaves the colour out of an update so the existing one is kept", () => {
    const v = seasonWriteValues(row(S("X", { op: "update", id: SID, expectedUpdatedAt: AT })));
    expect("color" in v).toBe(false);
    expect(Object.keys(v).sort()).toEqual(["category", "end_date", "name", "notes", "start_date"]);
  });
});

describe("earliestDate", () => {
  it("finds the first date across holidays and seasons", () => {
    expect(earliestDate(clean([S("A"), H("B", { values: { name: "B", category: "Custom", start: "2026-01-01" } })]))).toBe("2026-01-01");
    expect(earliestDate([])).toBeNull();
  });
});
