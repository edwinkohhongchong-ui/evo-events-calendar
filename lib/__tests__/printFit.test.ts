import { describe, it, expect } from "vitest";
import { clippedHeight, findFitScale, maxFitScale, FIT_SAFETY } from "../printFit";

describe("findFitScale", () => {
  it("returns 1 when content already fits", () => {
    expect(findFitScale((z) => 500 * z, 700)).toBe(1);
  });
  it("shrinks until content fits (linear height)", () => {
    const z = findFitScale((zz) => 1000 * zz, 700, 0.4, 0.02);
    expect(z).toBeCloseTo(0.7, 5);
    expect(1000 * z).toBeLessThanOrEqual(700);
    // one step larger would not fit
    expect(1000 * (z + 0.02)).toBeGreaterThan(700);
  });
  it("accounts for reflow (height not proportional to z)", () => {
    // Narrower layout at small z wraps less: height = 900 * z^2
    const z = findFitScale((zz) => 900 * zz * zz, 600, 0.4, 0.02);
    expect(900 * z * z).toBeLessThanOrEqual(600);
    expect(900 * (z + 0.02) ** 2).toBeGreaterThan(600);
  });
  it("stops at the floor when nothing fits", () => {
    expect(findFitScale(() => 5000, 700, 0.4, 0.02)).toBe(0.4);
  });
  it("evaluates the floor itself", () => {
    expect(findFitScale((z) => (z <= 0.4 ? 100 : 9999), 700, 0.4, 0.02)).toBe(0.4);
  });
  it("tolerates bad params", () => {
    expect(findFitScale(() => 1, 10, 0.4, 0)).toBe(1);
  });
});

describe("findFitScale with a max above 1", () => {
  it("scales up to max when the content is short", () => {
    expect(findFitScale((z) => 300 * z, 700, 0.4, 0.02, 1.48)).toBe(1.48);
  });
  it("steps down from max until it fits", () => {
    const z = findFitScale((zz) => 500 * zz, 700, 0.4, 0.02, 1.48);
    expect(z).toBeCloseTo(1.4, 5);
    expect(500 * (z + 0.02)).toBeGreaterThan(700);
  });
  it("never goes below the floor", () => {
    expect(findFitScale(() => 9999, 700, 0.4, 0.02, 2)).toBe(0.4);
  });
  it("returns the floor when max is below it", () => {
    expect(findFitScale(() => 1, 700, 0.4, 0.02, 0.3)).toBe(0.4);
  });
});

describe("maxFitScale", () => {
  it("is 1 for an A4 landscape width and floors to the step", () => {
    expect(maxFitScale(1062)).toBe(1);
    expect(maxFitScale(1527)).toBe(1.42);
  });
  it("caps at 2 and shrinks for narrow sheets", () => {
    expect(maxFitScale(5000)).toBe(2);
    expect(maxFitScale(704)).toBe(0.66);
  });
});

describe("FIT_SAFETY", () => {
  it("leaves headroom on the page", () => {
    expect(FIT_SAFETY).toBeLessThan(1);
    expect(FIT_SAFETY).toBeGreaterThan(0.8);
    const avail = 700 * FIT_SAFETY;
    const z = findFitScale((zz) => 1000 * zz, avail, 0.4, 0.02);
    expect(1000 * z).toBeLessThanOrEqual(avail);
  });
});

describe("clippedHeight", () => {
  it("removes the overshoot so the page ends at availH", () => {
    expect(clippedHeight(600, 780, 718)).toBe(538);
  });
  it("leaves the height alone when nothing overshoots", () => {
    expect(clippedHeight(600, 700, 718)).toBe(600);
  });
  it("never goes negative", () => {
    expect(clippedHeight(10, 900, 718)).toBe(0);
  });
});
