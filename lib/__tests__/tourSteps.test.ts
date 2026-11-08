import { describe, it, expect } from "vitest";
import { TOUR_STEPS, tourStepsFor } from "../tourSteps";

describe("tour steps by role", () => {
  it("drops the General / Month Notes steps for Viewers only", () => {
    const viewer = tourStepsFor(false);
    expect(viewer.some((s) => /Notes \(/.test(s.title))).toBe(false);
    expect(viewer.some((s) => s.targetSelector?.includes("notes-panel"))).toBe(false);
    expect(tourStepsFor(true)).toEqual(TOUR_STEPS);
    expect(TOUR_STEPS.some((s) => s.targetSelector?.includes("notes-panel"))).toBe(true);
  });
});
