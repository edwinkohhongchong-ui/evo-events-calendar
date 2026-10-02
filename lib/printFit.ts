/** Safety factor: fit to this fraction of the page height so print-vs-screen wrap differences never push content off the sheet. */
export const FIT_SAFETY = 0.92;

/**
 * Highest scale worth trying on a sheet `contentW` px wide: content is laid out
 * at least `baseW` px wide (the width the print CSS was tuned for), so larger
 * paper scales up instead of printing tiny text. Floored to `step`, capped at `cap`.
 */
export function maxFitScale(contentW: number, baseW = 1062, cap = 2, step = 0.02): number {
  const raw = Math.min(cap, contentW / baseW);
  return Math.round(Math.floor(raw / step + 1e-9) * step * 1000) / 1000;
}

/**
 * Largest scale z in [floor..max] such that measure(z) <= availH, searched from
 * `max` (default 1) downwards in `step` decrements. `measure(z)` must lay the content out at
 * scale z and return the resulting content height in px (it may have side
 * effects on the DOM). If nothing fits, returns `floor` (never clips here —
 * the caller decides what to do at the floor).
 */
export function findFitScale(
  measure: (z: number) => number,
  availH: number,
  floor = 0.4,
  step = 0.02,
  max = 1
): number {
  if (!(step > 0) || !(floor > 0)) return 1;
  if (floor > max) return floor;
  // Integer stepping avoids float drift (max - 0.02*n).
  const steps = Math.floor((max - floor) / step + 1e-9);
  for (let i = 0; i <= steps; i++) {
    const z = Math.round((max - i * step) * 1000) / 1000;
    if (z < floor) break;
    if (measure(z) <= availH) return z;
  }
  return floor;
}

/**
 * Height to give the clipping wrapper when content still overshoots the page at
 * the scale floor: the wrapper's own height minus the overshoot, so header +
 * grid + footer end exactly at `availH` instead of spilling onto a second sheet.
 */
export function clippedHeight(wrapperH: number, endY: number, availH: number): number {
  return Math.max(0, wrapperH - Math.max(0, endY - availH));
}
