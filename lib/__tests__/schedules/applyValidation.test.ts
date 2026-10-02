import { describe, it, expect } from "vitest";
import {
  MAX_IMPORT_ROWS,
  describeApply,
  rowProblems,
  validateSelection,
  type ApplySummary,
  type ImportRowInput,
} from "../../schedules/applyValidation";

const season = (over: Partial<ImportRowInput["values"]> = {}, rest: Partial<ImportRowInput> = {}): ImportRowInput => ({
  kind: "season",
  op: "create",
  values: { name: "Primary School Holidays (March)", category: "School Schedule", start: "2026-03-14", end: "2026-03-22", notes: "", ...over },
  ...rest,
});
const holiday = (over: Partial<ImportRowInput["values"]> = {}, rest: Partial<ImportRowInput> = {}): ImportRowInput => ({
  kind: "holiday",
  op: "create",
  values: { name: "Good Friday", category: "National (SG Public Holiday)", start: "2026-04-03", ...over },
  ...rest,
});
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const AT = "2026-03-01T10:00:00.123456+00:00";
const upd = (id: string = ID1): Partial<ImportRowInput> => ({ op: "update", id, expectedUpdatedAt: AT });
const rejected = (raw: unknown) => {
  const r = validateSelection(raw);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};

describe("validateSelection", () => {
  it("accepts good rows and maps columns (create vs update)", () => {
    const r = validateSelection([
      season(),
      season({ name: "  Poly Holidays (SP, RP) ", notes: " n ", color: "#ABCDEF" }, upd(ID1)),
      holiday({ end: "ignored" }),
      holiday({}, upd(ID2)),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toEqual({
      kind: "season",
      op: "create",
      id: undefined,
      values: { name: "Primary School Holidays (March)", category: "School Schedule", start_date: "2026-03-14", end_date: "2026-03-22", notes: null, color: undefined },
    });
    expect(r.rows[1]).toMatchObject({ op: "update", id: ID1, expectedUpdatedAt: AT, values: { name: "Poly Holidays (SP, RP)", notes: "n", color: "#abcdef" } });
    expect(r.rows[2]).toEqual({
      kind: "holiday",
      op: "create",
      id: undefined,
      values: { name: "Good Friday", type: "National (SG Public Holiday)", holiday_date: "2026-04-03" },
    });
    expect(r.rows[3]).toMatchObject({ op: "update", id: ID2, expectedUpdatedAt: AT });
  });

  it("rejects the whole selection if any row is bad, naming the row", () => {
    const msg = rejected([season(), season({ name: "Bad one", start: "2026-02-30" })]);
    expect(msg).toMatch(/^Row 2 "Bad one"/);
    expect(msg).toMatch(/Nothing was imported/);
  });

  it("rejects end before start (the A Level typo) and impossible dates", () => {
    expect(rejected([season({ start: "2026-10-14", end: "2025-10-21" })])).toMatch(/before the start/);
    expect(rejected([season({ end: "2026-13-01" })])).toMatch(/end date is not a valid/);
    expect(rejected([season({ start: "26-3-1" })])).toMatch(/start date is not a valid/);
  });

  it("rejects years outside the supported range", () => {
    expect(rejected([season({ start: "1999-12-31", end: "2000-01-02" })])).toMatch(/between 2000 and 2100/);
    expect(rejected([holiday({ start: "2101-01-01" })])).toMatch(/between 2000 and 2100/);
  });

  it("checks name length, category/type, notes and colour", () => {
    expect(rejected([season({ name: "   " })])).toMatch(/name/i);
    expect(rejected([season({ name: "x".repeat(121) })])).toMatch(/120/);
    expect(validateSelection([season({ name: "x".repeat(120) })]).ok).toBe(true);
    expect(rejected([season({ category: "Nonsense" })])).toMatch(/category/i);
    expect(rejected([season({ category: "National (SG Public Holiday)" })])).toMatch(/category/i);
    expect(rejected([holiday({ category: "Exam Period" })])).toMatch(/holiday type/i);
    expect(rejected([season({ notes: "n".repeat(501) })])).toMatch(/500/);
    expect(validateSelection([season({ notes: "n".repeat(500) })]).ok).toBe(true);
    expect(rejected([season({ color: "not-a-colour" })])).toMatch(/colour/);
    expect(validateSelection([season({ color: "amber" })]).ok).toBe(true);
  });

  it("requires a UUID id for updates and rejects odd ids", () => {
    expect(rejected([season({}, { op: "update", expectedUpdatedAt: AT })])).toMatch(/should update/);
    expect(rejected([season({}, { op: "update", id: "x; drop table", expectedUpdatedAt: AT })])).toMatch(/should update/);
    expect(rejected([season({}, { op: "update", id: "abc-123", expectedUpdatedAt: AT })])).toMatch(/should update/);
    expect(rejected([season({}, { op: "update", id: ID1.slice(0, -1), expectedUpdatedAt: AT })])).toMatch(/should update/);
  });

  it("requires a valid updated_at timestamp for updates (the optimistic lock)", () => {
    expect(rejected([season({}, { op: "update", id: ID1 })])).toMatch(/last read/);
    for (const bad of ["yesterday", "2026-03-01", "2026-13-01T10:00:00Z", "2026-03-01T10:00:00", 12345, "x".repeat(60)]) {
      expect(rejected([season({}, { op: "update", id: ID1, expectedUpdatedAt: bad as never })]), String(bad)).toMatch(/last read/);
    }
    for (const good of ["2026-03-01T10:00:00Z", "2026-03-01T10:00:00.1+08:00", AT]) {
      expect(validateSelection([season({}, { op: "update", id: ID1, expectedUpdatedAt: good })]).ok, good).toBe(true);
    }
  });

  it("rejects two updates to the same calendar entry in one selection", () => {
    expect(rejected([season({}, upd(ID1)), season({ name: "Other" }, upd(ID1.toUpperCase()))])).toMatch(/^Row 2 "Other" updates the same calendar entry/);
    expect(validateSelection([season({}, upd(ID1)), season({ name: "Other" }, upd(ID2))]).ok).toBe(true);
    // A holiday and a season are different tables, so the same id string is not a clash.
    expect(validateSelection([season({}, upd(ID1)), holiday({}, upd(ID1))]).ok).toBe(true);
  });

  it("rejects the same row being created twice, but allows different dates or names", () => {
    expect(rejected([season(), season({ name: "primary school holidays (march)" })])).toMatch(/^Row 2 .*same as an earlier row/);
    expect(rejected([holiday(), holiday()])).toMatch(/same as an earlier row/);
    expect(validateSelection([season(), season({ start: "2026-03-15" })]).ok).toBe(true);
    expect(validateSelection([holiday(), holiday({ start: "2026-04-04" })]).ok).toBe(true);
    expect(validateSelection([holiday(), season({ name: "Good Friday", start: "2026-04-03", end: "2026-04-03" })]).ok).toBe(true);
  });

  it("strips control, zero-width and bidi characters from names and notes (server is the authority)", () => {
    const r = validateSelection([
      season({ name: "Poly\u200b Holi\u202edays\u0000\u0007 (SP)\u2066", notes: "a\u200bb\r\nc\u0001\u202e d\n\n\n\ne" }),
      holiday({ name: "\ufeffGood\u0085 Friday\u200f" }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0].values).toMatchObject({ name: "Poly Holidays (SP)", notes: "ab\nc d\n\ne" });
    expect(r.rows[1].values).toMatchObject({ name: "Good\u0085 Friday" });
  });

  it("a name made only of invisible characters counts as empty", () => {
    expect(rejected([season({ name: "\u200b\u200d\u202e " })])).toMatch(/name/i);
  });

  it("rejects malformed rows and non-arrays", () => {
    expect(rejected(null)).toMatch(/Nothing/);
    expect(rejected("rows")).toMatch(/Nothing/);
    expect(rejected([])).toMatch(/No rows/);
    expect(rejected([null])).toMatch(/not a valid row/);
    expect(rejected([{ kind: "event", op: "create", values: {} }])).toMatch(/not a valid row/);
    expect(rejected([{ kind: "season", op: "delete", values: {} }])).toMatch(/not a valid row/);
    expect(rejected([{ kind: "season", op: "create" }])).toMatch(/not a valid row/);
  });

  it("caps a call at 300 rows", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => season({ name: `Season ${i}` }));
    expect(validateSelection(many(MAX_IMPORT_ROWS)).ok).toBe(true);
    expect(rejected(many(MAX_IMPORT_ROWS + 1))).toMatch(/more than 300/);
  });

  it("ignores unexpected fields such as id/created_at smuggled into values", () => {
    const r = validateSelection([season({ id: "evil", created_at: "x" } as never)]);
    expect(r.ok && Object.keys(r.rows[0].values).sort()).toEqual(["category", "color", "end_date", "name", "notes", "start_date"]);
  });
});

describe("rowProblems", () => {
  it("is empty for good values and a holiday needs no end date", () => {
    expect(rowProblems("season", season().values)).toEqual([]);
    expect(rowProblems("holiday", { name: "X", category: "Custom", start: "2026-01-01" })).toEqual([]);
  });
});

describe("describeApply", () => {
  const base: ApplySummary = { holidaysAdded: 0, holidaysUpdated: 0, seasonsAdded: 0, seasonsUpdated: 0, failed: null, notAttempted: 0 };
  it("summarises a clean run", () => {
    expect(describeApply({ ...base, holidaysAdded: 1, seasonsAdded: 40, seasonsUpdated: 2 })).toBe("Added 1 holiday, added 40 seasons, updated 2 seasons.");
  });
  it("explains a part-way failure in plain words", () => {
    const text = describeApply({
      ...base,
      seasonsAdded: 3,
      failed: { row: 4, name: "NUS Recess Week", message: "Something went wrong saving this season." },
      notAttempted: 6,
    });
    expect(text).toContain('Stopped at row 4 ("NUS Recess Week")');
    expect(text).toContain("3 rows were already saved");
    expect(text).toContain("can be undone");
    expect(text).toContain("6 later rows were not tried");
  });
  it("says nothing was saved when the first row fails", () => {
    expect(describeApply({ ...base, failed: { row: 1, name: "X", message: "Nope." }, notAttempted: 0 })).toContain("Nothing was saved.");
  });
});
