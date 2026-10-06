import { describe, it, expect, vi } from "vitest";
import { DAY_NOTE_DETAILS_MAX, isMissingDetailsColumn, normaliseNoteDetails } from "../dayNoteDetails";

describe("normaliseNoteDetails", () => {
  it("returns null for missing or blank details", () => {
    expect(normaliseNoteDetails(undefined)).toBeNull();
    expect(normaliseNoteDetails(null)).toBeNull();
    expect(normaliseNoteDetails("  \n  ")).toBeNull();
  });
  it("trims the ends but keeps inner line breaks", () => {
    expect(normaliseNoteDetails("  Bring cards\n\nAsk Ann  ")).toBe("Bring cards\n\nAsk Ann");
  });
  it("accepts exactly the max and rejects one over", () => {
    expect(normaliseNoteDetails("a".repeat(DAY_NOTE_DETAILS_MAX))).toHaveLength(DAY_NOTE_DETAILS_MAX);
    expect(() => normaliseNoteDetails("a".repeat(DAY_NOTE_DETAILS_MAX + 1))).toThrow(/2000/);
  });
  it("measures length after trimming", () => {
    expect(normaliseNoteDetails(` ${"a".repeat(DAY_NOTE_DETAILS_MAX)} `)).toHaveLength(DAY_NOTE_DETAILS_MAX);
  });
  it("rejects non-strings", () => {
    expect(() => normaliseNoteDetails(42)).toThrow();
    expect(() => normaliseNoteDetails({})).toThrow();
  });
});

describe("isMissingDetailsColumn", () => {
  it.each(["42703", "PGRST204"])("detects %s", (code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isMissingDetailsColumn({ code })).toBe(true);
  });
  it("detects a schema-cache message and ignores unrelated errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      isMissingDetailsColumn({ message: "Could not find the 'details' column of 'day_notes' in the schema cache" })
    ).toBe(true);
    expect(isMissingDetailsColumn({ code: "23514" })).toBe(false);
    expect(isMissingDetailsColumn(null)).toBe(false);
  });
});
