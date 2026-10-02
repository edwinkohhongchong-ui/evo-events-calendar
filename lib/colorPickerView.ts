import { GOOGLE_PALETTE, GOOGLE_PALETTE_VISIBLE } from "./googlePalette";

// Whether a palette swatch for `current` is on screen in the picker's grid.
export function isSwatchRendered(current: string, open: boolean): boolean {
  return GOOGLE_PALETTE_VISIBLE.includes(current) || (open && GOOGLE_PALETTE.includes(current));
}
