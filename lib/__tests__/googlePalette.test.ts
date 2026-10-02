import { describe, it, expect } from "vitest";
import {
  GOOGLE_PALETTE,
  GOOGLE_PALETTE_ROWS,
  GOOGLE_PALETTE_VISIBLE,
  generateGooglePalette,
} from "../googlePalette";

describe("Google Sheets palette", () => {
  it("is 8 rows x 10 columns of lowercase #rrggbb", () => {
    const rows = generateGooglePalette();
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row).toHaveLength(10);
      for (const hex of row) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("has no duplicates across the grid", () => {
    expect(new Set(GOOGLE_PALETTE).size).toBe(80);
  });
  it("has white once, at the end of row 1", () => {
    expect(GOOGLE_PALETTE.filter((h) => h === "#ffffff")).toHaveLength(1);
    expect(GOOGLE_PALETTE_ROWS[0][9]).toBe("#ffffff");
  });
  it("shows rows 1 and 2 (the first 20) by default", () => {
    expect(GOOGLE_PALETTE_VISIBLE).toEqual(GOOGLE_PALETTE.slice(0, 20));
    expect(GOOGLE_PALETTE_ROWS[0][0]).toBe("#000000");
    expect(GOOGLE_PALETTE_ROWS[1][0]).toBe("#980000");
  });
});
