import { describe, it, expect } from "vitest";
import { findFitScale } from "../printFit";

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
