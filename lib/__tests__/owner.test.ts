import { describe, it, expect } from "vitest";
import {
  OWNER_MAX,
  buildOwnerOptions,
  filterRowsByOwner,
  isMissingOwnerColumn,
  normalizeOwner,
  ownerMatches,
  parseOwner,
  withOwner,
} from "../owner";

describe("normalizeOwner", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeOwner("  Edwin   Koh ")).toBe("Edwin Koh");
    expect(normalizeOwner(null)).toBe("");
  });
});

describe("parseOwner", () => {
  it("returns null for blank/missing and the trimmed name otherwise", () => {
    expect(parseOwner(undefined)).toBeNull();
    expect(parseOwner(null)).toBeNull();
    expect(parseOwner("   ")).toBeNull();
    expect(parseOwner(" Darius ")).toBe("Darius");
  });
  it("accepts exactly 60 characters and rejects 61", () => {
    expect(parseOwner("a".repeat(OWNER_MAX))).toBe("a".repeat(OWNER_MAX));
    expect(() => parseOwner("a".repeat(OWNER_MAX + 1))).toThrow(/60/);
  });
  it("rejects non-strings", () => {
    expect(() => parseOwner(42)).toThrow();
    expect(() => parseOwner({})).toThrow();
  });
});

describe("withOwner", () => {
  it("omits owner when blank (works before migration 025)", () => {
    expect("owner" in withOwner({ name: "x", owner: "  " })).toBe(false);
    expect("owner" in withOwner({ name: "x" })).toBe(false);
  });
  it("includes the trimmed owner when set", () => {
    expect(withOwner({ name: "x", owner: " Ann " })).toEqual({ name: "x", owner: "Ann" });
  });
  it("sends null only when allowed to clear", () => {
    expect(withOwner({ name: "x", owner: "" }, true)).toEqual({ name: "x", owner: null });
  });
  it("throws when too long", () => {
    expect(() => withOwner({ owner: "a".repeat(61) })).toThrow();
  });
});

describe("isMissingOwnerColumn", () => {
  it.each(["42703", "PGRST204", "PGRST205"])("detects %s", (code) => {
    expect(isMissingOwnerColumn({ code })).toBe(true);
  });
  it("detects a schema-cache message and ignores unrelated errors", () => {
    expect(isMissingOwnerColumn({ message: "Could not find the 'owner' column of 'events' in the schema cache" })).toBe(true);
    expect(isMissingOwnerColumn({ code: "23503" })).toBe(false);
    expect(isMissingOwnerColumn(null)).toBe(false);
  });
});

describe("ownerMatches", () => {
  it("matches case-insensitively and trimmed", () => {
    expect(ownerMatches("  edwin KOH", "Edwin Koh ")).toBe(true);
    expect(ownerMatches("Edwin", "Darius")).toBe(false);
  });
  it("never matches blanks", () => {
    expect(ownerMatches(null, "")).toBe(false);
    expect(ownerMatches("Ann", null)).toBe(false);
  });
});

describe("buildOwnerOptions", () => {
  it("de-dupes case-insensitively, drops blanks and sorts", () => {
    expect(buildOwnerOptions(["ann", "Ben", "Ann", null, "  ", undefined, "ben "])).toEqual(["ann", "Ben"]);
  });
});

describe("filterRowsByOwner", () => {
  const ev = (owner: string | null) => ({ owner });
  const rows = [
    { id: "a", owner: "Ann", event: ev("Ben") },
    { id: "b", owner: null, event: ev("ann") },
    { id: "c", owner: "  ", event: ev(null) },
    { id: "d", event: ev("Ben") },
  ];
  it("uses the item owner, falling back to the event owner", () => {
    expect(filterRowsByOwner(rows, " ANN ").map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("returns nothing for a blank name", () => {
    expect(filterRowsByOwner(rows, "")).toEqual([]);
    expect(filterRowsByOwner(rows, null)).toEqual([]);
  });
});
