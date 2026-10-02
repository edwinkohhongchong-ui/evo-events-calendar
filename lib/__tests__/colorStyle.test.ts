import { describe, it, expect } from "vitest";
import {
  barStyle,
  chipStyle,
  contrastRatio,
  dotStyle,
  isHexColor,
  isNamedColor,
  normaliseColor,
  readableTextColor,
  tint,
} from "../colorStyle";
import { LEVEL_CHIP_CLASSES, LEVEL_DOT_CLASSES, SEASON_BAR_COLORS, SEASON_COLOR_KEYS } from "../constants";
import { GOOGLE_PALETTE } from "../googlePalette";

describe("named keys render exactly as before", () => {
  it("returns the original class strings and no inline style", () => {
    for (const key of SEASON_COLOR_KEYS) {
      expect(chipStyle(key)).toEqual({ className: LEVEL_CHIP_CLASSES[key] });
      expect(dotStyle(key)).toEqual({ className: LEVEL_DOT_CLASSES[key] });
      expect(barStyle(key)).toEqual({ className: SEASON_BAR_COLORS[key] });
    }
  });
});

describe("hex validation and normalisation", () => {
  it("accepts only #rrggbb", () => {
    expect(isHexColor("#1F2A44")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("1f2a44")).toBe(false);
    expect(isHexColor("#1f2a4g")).toBe(false);
    expect(isHexColor("#1f2a4400")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });
  it("lowercases hex, keeps named keys, rejects the rest", () => {
    expect(normaliseColor("#D9A441")).toBe("#d9a441");
    expect(normaliseColor("indigo")).toBe("indigo");
    expect(isNamedColor("indigo")).toBe(true);
    expect(normaliseColor("chartreuse")).toBeNull();
    expect(normaliseColor("#12")).toBeNull();
    expect(normaliseColor(undefined)).toBeNull();
  });
});

describe("contrast and tint", () => {
  it("picks white text on dark colours and ink on light colours", () => {
    expect(readableTextColor("#1f2a44")).toBe("#ffffff");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#ffff00")).toBe("#1d1d1f");
    expect(readableTextColor("#ffffff")).toBe("#1d1d1f");
    expect(readableTextColor("#d9a441")).toBe("#1d1d1f");
  });
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
  it("always reaches WCAG AA (4.5:1) for the chosen text colour on every Google palette bar", () => {
    for (const hex of GOOGLE_PALETTE) {
      expect(contrastRatio(hex, readableTextColor(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("chip text reaches WCAG AA on the chip tint for every Google palette colour", () => {
    for (const hex of GOOGLE_PALETTE) {
      expect(contrastRatio(tint(hex, 0.22), readableTextColor(tint(hex, 0.22)))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("tint mixes over white", () => {
    expect(tint("#000000", 0.22)).toBe("#c7c7c7");
    expect(tint("#ffffff", 0.22)).toBe("#ffffff");
    expect(tint("#ff0000", 0)).toBe("#ffffff");
    expect(tint("#ff0000", 1)).toBe("#ff0000");
  });
});

describe("hex values render through inline styles", () => {
  it("chip: tint background, 3px left bar, readable text", () => {
    const c = chipStyle("#D9A441" as `#${string}`);
    expect(c.className).toBe("border-l-[3px]");
    expect(c.style).toMatchObject({
      backgroundColor: "rgba(217, 164, 65, 0.22)",
      borderLeftColor: "#d9a441",
      color: "#1d1d1f",
    });
  });
  it("dot: solid background", () => {
    expect(dotStyle("#1F2A44")).toEqual({ className: "", style: { backgroundColor: "#1f2a44" } });
  });
  it("bar: solid background, darker border, readable text", () => {
    const b = barStyle("#1f2a44");
    expect(b.style).toMatchObject({ backgroundColor: "#1f2a44", color: "#ffffff" });
    expect(b.style?.borderColor).not.toBe("#1f2a44");
  });
});
