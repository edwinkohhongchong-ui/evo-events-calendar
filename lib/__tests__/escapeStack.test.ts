import { describe, it, expect, vi } from "vitest";
import { dispatchEscape, escapeStackSize, pushEscapeHandler } from "../escapeStack";
import { nextFocusIndex } from "../focusTrap";

describe("escape stack", () => {
  it("runs only the top-most handler", () => {
    const parent = vi.fn();
    const child = vi.fn();
    const removeParent = pushEscapeHandler({ current: parent });
    const removeChild = pushEscapeHandler({ current: child });
    expect(dispatchEscape()).toBe(true);
    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
    removeChild();
    dispatchEscape();
    expect(parent).toHaveBeenCalledTimes(1);
    removeParent();
    expect(escapeStackSize()).toBe(0);
    expect(dispatchEscape()).toBe(false);
  });

  it("removing a buried handler leaves the top intact", () => {
    const a = vi.fn();
    const b = vi.fn();
    const removeA = pushEscapeHandler({ current: a });
    const removeB = pushEscapeHandler({ current: b });
    removeA();
    dispatchEscape();
    expect(b).toHaveBeenCalledTimes(1);
    removeB();
  });
});

describe("nextFocusIndex", () => {
  it("wraps forward and backward", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });
  it("lets the browser handle middle items", () => {
    expect(nextFocusIndex(3, 1, false)).toBeNull();
    expect(nextFocusIndex(3, 1, true)).toBeNull();
  });
  it("enters the trap from the container", () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
  });
  it("handles empty", () => {
    expect(nextFocusIndex(0, -1, false)).toBeNull();
  });
});
