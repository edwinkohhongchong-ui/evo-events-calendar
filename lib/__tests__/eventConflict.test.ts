import { describe, expect, it } from "vitest";
import { EVENT_CONFLICT_MESSAGE, isEventConflict } from "../eventConflict";

describe("isEventConflict", () => {
  it("recognises the conflict message", () => {
    expect(isEventConflict(EVENT_CONFLICT_MESSAGE)).toBe(true);
  });
  it("ignores other errors and empty values", () => {
    expect(isEventConflict("Event not found.")).toBe(false);
    expect(isEventConflict("")).toBe(false);
    expect(isEventConflict(null)).toBe(false);
    expect(isEventConflict(undefined)).toBe(false);
  });
});
