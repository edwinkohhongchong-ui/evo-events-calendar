const STEPS = ["00", "33", "66", "99", "cc", "ff"] as const;

// The classic 216 web-safe colours: every combination of 00/33/66/99/cc/ff per
// channel, as lowercase "#rrggbb", in red-major order.
export function generateWebSafeColors(): string[] {
  const out: string[] = [];
  for (const r of STEPS) for (const g of STEPS) for (const b of STEPS) out.push(`#${r}${g}${b}`);
  return out;
}

export const WEB_SAFE_COLORS: string[] = generateWebSafeColors();
