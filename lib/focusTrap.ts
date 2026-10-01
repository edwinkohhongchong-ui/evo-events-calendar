/**
 * Where Tab should go inside a focus trap. `current` is the focused item's
 * index (-1 when focus is on the container itself or outside the list).
 * Returns the index to focus, or null to let the browser move focus normally.
 */
export function nextFocusIndex(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (current === -1) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}
