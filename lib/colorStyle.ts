import type { CSSProperties } from "react";
import { LEVEL_CHIP_CLASSES, LEVEL_DOT_CLASSES, SEASON_BAR_COLORS, SEASON_COLOR_KEYS } from "./constants";
import type { ColorValue, SeasonColorKey } from "./types";

// A colour VALUE is either a named palette key (rendered with literal Tailwind
// classes, exactly as before) or a custom "#rrggbb" hex (rendered with inline
// styles, since Tailwind can't see runtime values). Every renderer goes
// through the *Style helpers below so the two cases stay in one place.

export interface ColorStyle {
  className: string;
  style?: CSSProperties;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const INK = "#1d1d1f";
const WHITE = "#ffffff";
const BLACK = "#000000";

// Shown when a hex colour is rejected by the pre-026 check constraint.
export const CUSTOM_COLOR_MIGRATION_MESSAGE =
  "Custom colours need the latest database update (run migration 026).";

export function isHexColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && HEX_RE.test(value);
}

export function isNamedColor(value: unknown): value is SeasonColorKey {
  return typeof value === "string" && (SEASON_COLOR_KEYS as string[]).includes(value);
}

// Returns the canonical stored form (named key as-is, hex lowercased), or null
// if the value is neither.
export function normaliseColor(value: unknown): ColorValue | null {
  if (isNamedColor(value)) return value;
  if (isHexColor(value)) return value.toLowerCase() as ColorValue;
  return null;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}

// WCAG 2.x relative luminance.
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Ink or white, whichever reads better; pure black only when neither reaches
// WCAG AA (4.5:1), which happens for a few mid-tones where ink falls just short.
export function readableTextColor(bgHex: string): string {
  const ink = contrastRatio(bgHex, INK);
  const white = contrastRatio(bgHex, WHITE);
  const best = ink >= white ? INK : WHITE;
  if (Math.max(ink, white) >= 4.5) return best;
  return contrastRatio(bgHex, BLACK) >= white ? BLACK : WHITE;
}

// Opaque mix of the colour over white at `amount` (0..1) — the chip tint.
export function tint(hex: string, amount = 0.22): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r, g, b].map((c) => 255 - (255 - c) * amount) as Rgb);
}

function darken(hex: string, amount: number): string {
  return rgbToHex(hexToRgb(hex).map((c) => c * (1 - amount)) as Rgb);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const CHIP_TINT = 0.22; // same strength as the named chips (bg-*-500/[0.22])

// Soft tinted event chip: ~22% tint + 3px full-colour left bar + readable text.
export function chipStyle(value: ColorValue): ColorStyle {
  if (!isHexColor(value)) return { className: LEVEL_CHIP_CLASSES[value as SeasonColorKey] ?? "" };
  const hex = value.toLowerCase();
  return {
    className: "border-l-[3px]",
    style: {
      backgroundColor: rgba(hex, CHIP_TINT),
      borderLeftColor: hex,
      color: readableTextColor(tint(hex, CHIP_TINT)),
    },
  };
}

// Small legend / swatch dot.
export function dotStyle(value: ColorValue): ColorStyle {
  if (!isHexColor(value)) return { className: LEVEL_DOT_CLASSES[value as SeasonColorKey] ?? "" };
  return { className: "", style: { backgroundColor: value.toLowerCase() } };
}

// Solid multi-day event bar / season bar / season pill. Callers add their own
// border-width, rounding and sizing classes; this supplies colour only.
export function barStyle(value: ColorValue): ColorStyle {
  if (!isHexColor(value)) return { className: SEASON_BAR_COLORS[value as SeasonColorKey] ?? "" };
  const hex = value.toLowerCase();
  return {
    className: "",
    style: { backgroundColor: hex, borderColor: darken(hex, 0.2), color: readableTextColor(hex) },
  };
}

export const seasonBarStyle = barStyle;
