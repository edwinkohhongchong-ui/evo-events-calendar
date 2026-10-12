import { describe, expect, it, vi } from "vitest";
import { isMissingMajorColumn, withMajor } from "../majorEvent";

describe("withMajor", () => {
  it("sends true", () => {
    expect(withMajor({ name: "x", is_major: true })).toEqual({ name: "x", is_major: true });
  });
  it("drops false and undefined when the column may not exist yet", () => {
    expect(withMajor({ name: "x", is_major: false })).toEqual({ name: "x" });
    expect(withMajor({ name: "x" })).toEqual({ name: "x" });
  });
  it("sends false only when the row proves the column exists", () => {
    expect(withMajor({ name: "x", is_major: false }, true)).toEqual({ name: "x", is_major: false });
    expect(withMajor({ name: "x" }, true)).toEqual({ name: "x" });
  });
  it("drops anything that is not a real boolean", () => {
    expect(withMajor({ is_major: "true" }, true)).toEqual({});
    expect(withMajor({ is_major: 1 }, true)).toEqual({});
  });
});

describe("isMissingMajorColumn", () => {
  it("recognises a missing column", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isMissingMajorColumn({ code: "42703" })).toBe(true);
    expect(isMissingMajorColumn({ code: "PGRST204" })).toBe(true);
    expect(isMissingMajorColumn({ message: 'Could not find the is_major column of events in the schema cache' })).toBe(true);
  });
  it("ignores other errors", () => {
    expect(isMissingMajorColumn({ code: "23503", message: "violates foreign key" })).toBe(false);
    expect(isMissingMajorColumn(null)).toBe(false);
  });
});
