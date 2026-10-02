"use client";

import { CSSProperties, KeyboardEvent, useId, useRef, useState } from "react";
import { barStyle, chipStyle, contrastRatio, isHexColor, normaliseColor, readableTextColor } from "@/lib/colorStyle";
import { isSwatchRendered } from "@/lib/colorPickerView";
import { GOOGLE_PALETTE_COLS, GOOGLE_PALETTE_ROWS, GOOGLE_PALETTE_VISIBLE_ROWS } from "@/lib/googlePalette";
import { ColorValue } from "@/lib/types";
import { INPUT } from "./fieldStyles";

interface ColorPickerProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
  disabled?: boolean;
}

const SWATCH_FOCUS = "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-navy focus-visible:outline-none";
// Fluid grids: the swatches shrink to fit the container (a 375px phone's ~303px
// modal body would overflow ten fixed 24-28px swatches), capped at 24px (28px on
// touch). Not 44px: ten 44px targets would need 440px+.
const GRID = "grid w-full grid-cols-10 gap-1.5";
const SWATCH = "border border-black/15 rounded-full";
const ROUND = `aspect-square w-full max-w-6 coarse:max-w-7 justify-self-center ${SWATCH}`;
// Fixed-size variant for swatches outside the grids (Current, Custom "+").
const ROUND_FIXED = `h-6 w-6 coarse:h-7 coarse:w-7 ${SWATCH}`;

// Tick colour for a swatch: white or black, whichever contrasts more.
function tickColor(hex: string) {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000") ? "#ffffff" : "#000000";
}

function Check({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none mx-auto h-3.5 w-3.5 coarse:h-4 coarse:w-4" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

// Colour picker for Seasons and Categories, laid out like the Google Sheets
// text-colour palette: greys + vivid rows up front, everything else (tints and
// shades, a custom colour) behind "More colours". A value that is not a palette
// swatch (a legacy named key or a custom hex) shows as a "Current" swatch.
// NB: the extra region is conditionally rendered, never `hidden`: a `flex` class
// overrides the [hidden] attribute, which is what made the toggle look dead.
// One radiogroup with a single tab stop (roving tabindex); arrow keys move
// through the swatches in DOM order and select as they go, like native radios.
export default function ColorPicker({ value, onChange, disabled = false }: ColorPickerProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const hexId = useId();
  const regionId = useId();
  // What the hex field shows while the user is typing; null = mirror `value`.
  const [draft, setDraft] = useState<string | null>(null);

  const current = normaliseColor(value) ?? value;
  const hexText = draft ?? (isHexColor(current) ? current : "");
  const draftInvalid = draft !== null && draft !== "" && normaliseColor(draft.startsWith("#") ? draft : `#${draft}`) === null;
  // Collapsed by default; only the toggle button changes these.
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const gridRendered = isSwatchRendered(current, open);

  function pick(next: ColorValue) {
    if (disabled) return;
    setDraft(null);
    onChange(next);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== "radio") return;
    const radios = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []).filter(
      (el) => el.offsetParent !== null
    );
    const i = radios.indexOf(target as HTMLButtonElement);
    const cols = Number(target.dataset.cols) || 1;
    const step =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : 0;
    if (!step || i < 0) return;
    const next = radios[i + step];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  }

  function handleHexInput(raw: string) {
    setDraft(raw);
    const withHash = raw.startsWith("#") ? raw : `#${raw}`;
    const normalised = normaliseColor(withHash);
    if (normalised && isHexColor(normalised)) onChange(normalised);
  }

  function swatch(
    key: string,
    colorValue: ColorValue,
    className: string,
    style: CSSProperties | undefined,
    cols: number,
    first: boolean,
    tick: string
  ) {
    const selected = current === colorValue;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={key}
        title={key}
        data-cols={cols}
        disabled={disabled}
        tabIndex={selected || (first && !gridRendered && !selectionExtra) ? 0 : -1}
        onClick={() => pick(colorValue)}
        className={[className, SWATCH_FOCUS, "flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"].join(" ")}
        style={style}
      >
        {selected && <Check color={tick} />}
      </button>
    );
  }

  // The selection when it has no swatch in the grid (named key, custom hex, or a
  // tint hidden while collapsed): shown as "Current" so it is never invisible.
  const selectionExtra = !gridRendered;

  const hexSwatch = (hex: string, first: boolean) =>
    swatch(hex, hex as ColorValue, ROUND, { backgroundColor: hex }, GOOGLE_PALETTE_COLS, first, tickColor(hex));

  const chip = chipStyle(current);
  const bar = barStyle(current);
  const barContrast = isHexColor(current)
    ? contrastRatio(current, readableTextColor(current)).toFixed(1)
    : null;

  const visibleRows = GOOGLE_PALETTE_ROWS.slice(0, GOOGLE_PALETTE_VISIBLE_ROWS);
  const moreRows = GOOGLE_PALETTE_ROWS.slice(GOOGLE_PALETTE_VISIBLE_ROWS);

  return (
    <div ref={groupRef} role="radiogroup" aria-label="Colour" onKeyDown={handleKeyDown} className="flex flex-col gap-3">
      <div className={GRID}>{visibleRows.flat().map((hex, i) => hexSwatch(hex, i === 0))}</div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-max items-center gap-1 rounded-ctl text-micro font-medium text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy coarse:min-h-[44px]"
      >
        {open ? "Fewer colours" : "More colours"}
        <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6l4.5 4.5L12.5 6" />
        </svg>
      </button>

      {open && (
        <div id={regionId} className="flex flex-col gap-3">
          <div className={GRID}>{moreRows.flat().map((hex) => hexSwatch(hex, false))}</div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-expanded={customOpen}
                aria-controls={`${hexId}-custom`}
                aria-label={customOpen ? "Hide custom colour fields" : "Add a custom colour"}
                disabled={disabled}
                onClick={() => setCustomOpen((o) => !o)}
                className={`${ROUND_FIXED} flex items-center justify-center bg-white text-ink-2 hover:text-ink ${SWATCH_FOCUS} disabled:opacity-60`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <span className="text-micro font-medium text-ink-2">Custom</span>
            </div>
            {customOpen && (
              <div id={`${hexId}-custom`} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a custom colour"
                    disabled={disabled}
                    value={isHexColor(current) ? current : "#1f2a44"}
                    onChange={(e) => pick(e.target.value.toLowerCase() as ColorValue)}
                    className="h-10 w-12 coarse:h-11 coarse:w-14 shrink-0 cursor-pointer rounded-ctl border border-line-strong bg-white p-1"
                  />
                  <input
                    id={hexId}
                    type="text"
                    inputMode="text"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={7}
                    placeholder="#1F2A44"
                    aria-label="Custom colour hex code"
                    aria-invalid={draftInvalid}
                    aria-describedby={draftInvalid ? `${hexId}-err` : undefined}
                    disabled={disabled}
                    value={hexText}
                    onChange={(e) => handleHexInput(e.target.value.trim())}
                    onBlur={() => setDraft(null)}
                    className={`${INPUT} max-w-[9rem] font-mono ${draftInvalid ? "!border-danger" : ""}`}
                  />
                </div>
                {draftInvalid && (
                  <p id={`${hexId}-err`} role="alert" className="text-micro text-danger">
                    Use 6 hex digits, like #1F2A44.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectionExtra && (
        <div className="flex items-center gap-1.5">
          {isHexColor(current)
            ? swatch(current, current, ROUND_FIXED, { backgroundColor: current }, 1, false, tickColor(current))
            : swatch(current, current, `${ROUND_FIXED} ${barStyle(current).className}`, undefined, 1, false, "#1d1d1f")}
          <span className="text-micro font-medium text-ink-2">Current</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="text-micro font-medium text-ink-2">Preview</span>
        <span className={`rounded-chip py-0.5 pl-1.5 pr-2 text-chip font-medium ${chip.className}`} style={chip.style}>
          Sample event
        </span>
        <span className={`rounded-pill border px-2.5 text-chip font-medium ${bar.className}`} style={bar.style}>
          Sample season
        </span>
        {barContrast && <span className="text-micro text-ink-2">Text contrast {barContrast}:1</span>}
      </div>
    </div>
  );
}
