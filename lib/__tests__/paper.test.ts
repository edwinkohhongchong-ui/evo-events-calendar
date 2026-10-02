import { describe, it, expect } from "vitest";
import { MARGIN_PX, PAPER_IDS, pageRule, parseOrient, parsePaper, printableArea, sheetSize } from "../paper";

describe("parsePaper / parseOrient", () => {
  it("accepts whitelisted values, case-insensitively", () => {
    for (const id of PAPER_IDS) expect(parsePaper(id)).toBe(id);
    expect(parsePaper("A3")).toBe("a3");
    expect(parseOrient("Portrait")).toBe("portrait");
  });
  it("rejects anything else", () => {
    for (const bad of ["a2", "", "constructor", undefined, null, 4, "a4;}"]) expect(parsePaper(bad)).toBeNull();
    expect(parseOrient("sideways")).toBeNull();
    expect(parseOrient(undefined)).toBeNull();
  });
  it("uses the first of repeated params", () => {
    expect(parsePaper(["a5", "a3"])).toBe("a5");
  });
});

describe("sheetSize / printableArea", () => {
  it("swaps for portrait", () => {
    expect(sheetSize("a4", "landscape")).toEqual({ w: 1123, h: 794 });
    expect(sheetSize("a4", "portrait")).toEqual({ w: 794, h: 1123 });
  });
  it("removes 8mm on each side", () => {
    const a = printableArea("a4", "landscape");
    expect(a.width).toBe(Math.floor(1123 - 2 * MARGIN_PX));
    expect(a.height).toBe(Math.floor(794 - 2 * MARGIN_PX));
    expect(MARGIN_PX).toBeCloseTo(30.236, 2);
  });
  it("A3 is bigger than A4 in both directions", () => {
    const a3 = printableArea("a3", "landscape");
    const a4 = printableArea("a4", "landscape");
    expect(a3.width).toBeGreaterThan(a4.width);
    expect(a3.height).toBeGreaterThan(a4.height);
  });
  it("portrait swaps width and height of the printable area", () => {
    const l = printableArea("letter", "landscape");
    const p = printableArea("letter", "portrait");
    expect(p).toEqual({ width: l.height, height: l.width });
  });
});

describe("pageRule", () => {
  it("builds an explicit size with the 8mm margin", () => {
    expect(pageRule("a4", "landscape")).toBe("@page { size: 297mm 210mm; margin: 8mm; }");
    expect(pageRule("a3", "portrait")).toBe("@page { size: 297mm 420mm; margin: 8mm; }");
  });
});
