import { describe, it, expect } from "vitest";
import { describeFeedMismatch, normaliseFeedToken } from "../feedToken";

describe("normaliseFeedToken", () => {
  it("trims whitespace and newlines", () => {
    expect(normaliseFeedToken("  abc123\n")).toBe("abc123");
  });
  it("strips one pair of matching surrounding quotes", () => {
    expect(normaliseFeedToken('"abc123"')).toBe("abc123");
    expect(normaliseFeedToken("'abc123'\n")).toBe("abc123");
  });
  it("leaves mismatched or inner quotes alone", () => {
    expect(normaliseFeedToken(`"abc123'`)).toBe(`"abc123'`);
    expect(normaliseFeedToken('ab"c')).toBe('ab"c');
  });
  it("handles undefined and empty", () => {
    expect(normaliseFeedToken(undefined)).toBe("");
    expect(normaliseFeedToken("   ")).toBe("");
    expect(normaliseFeedToken('""')).toBe("");
  });
});

describe("describeFeedMismatch", () => {
  it("explains without revealing token characters", () => {
    expect(describeFeedMismatch("", "x")).toMatch(/not set/);
    const lengths = describeFeedMismatch("a".repeat(65), "b".repeat(64));
    expect(lengths).toContain("65");
    expect(lengths).toContain("64");
    expect(lengths).not.toMatch(/a{5}|b{5}/);
    expect(describeFeedMismatch("aaaa", "bbbb")).toMatch(/different characters/);
  });
});
