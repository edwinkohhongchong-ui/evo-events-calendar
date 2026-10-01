import { describe, expect, it } from "vitest";
import { safeEqual } from "../safeEqual";

describe("safeEqual", () => {
  it("matches equal strings", () => {
    expect(safeEqual("hunter2", "hunter2")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
  });
  it("rejects different content, lengths, and prefixes", () => {
    expect(safeEqual("hunter2", "hunter3")).toBe(false);
    expect(safeEqual("hunter", "hunter2")).toBe(false);
    expect(safeEqual("hunter2", "hunter")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
    expect(safeEqual("a\u0000", "a")).toBe(false);
  });
});
