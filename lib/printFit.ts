/**
 * Largest scale z in (floor..1] such that measure(z) <= availH, searched from
 * 1 downwards in `step` decrements. `measure(z)` must lay the content out at
 * scale z and return the resulting content height in px (it may have side
 * effects on the DOM). If nothing fits, returns `floor` (never clips here —
 * the caller decides what to do at the floor).
 */
export function findFitScale(
  measure: (z: number) => number,
  availH: number,
  floor = 0.4,
  step = 0.02
): number {
  if (!(step > 0) || !(floor > 0) || floor > 1) return 1;
  // Integer stepping avoids float drift (1 - 0.02*n).
  const steps = Math.round((1 - floor) / step);
  for (let i = 0; i <= steps; i++) {
    const z = Math.round((1 - i * step) * 1000) / 1000;
    if (z < floor) break;
    if (measure(z) <= availH) return z;
  }
  return floor;
}
