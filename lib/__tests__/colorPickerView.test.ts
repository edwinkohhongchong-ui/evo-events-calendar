import { describe, expect, it } from "vitest";
import { isSwatchRendered } from "../colorPickerView";

describe("isSwatchRendered", () => {
  it("top-two-row colours are always rendered", () => {
    expect(isSwatchRendered("#ff0000", false)).toBe(true);
    expect(isSwatchRendered("#000000", true)).toBe(true);
  });
  it("tint/shade rows only render when expanded", () => {
    expect(isSwatchRendered("#e6b8af", false)).toBe(false);
    expect(isSwatchRendered("#e6b8af", true)).toBe(true);
  });
  it("named keys and custom hexes never render in the grid", () => {
    expect(isSwatchRendered("indigo", true)).toBe(false);
    expect(isSwatchRendered("#123456", true)).toBe(false);
  });
});
