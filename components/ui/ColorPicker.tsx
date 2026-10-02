"use client";

import { CSSProperties, KeyboardEvent, useId, useRef, useState } from "react";
import { SEASON_COLOR_KEYS } from "@/lib/constants";
import { barStyle, chipStyle, contrastRatio, isHexColor, isNamedColor, normaliseColor, readableTextColor } from "@/lib/colorStyle";
import { WEB_SAFE_COLORS } from "@/lib/webSafeColors";
import { ColorValue } from "@/lib/types";
import { INPUT } from "./fieldStyles";

interface ColorPickerProps {
  value: ColorValue;
  onChange: (value: ColorValue) => void;
}

const WEB_SAFE_COLS = 12;
const SWATCH_RING = "ring-2 ring-offset-1 ring-navy";
const SWATCH_FOCUS = "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-navy focus-visible:outline-none";

// Colour picker for Seasons and Categories: the 14 named palette colours, the
// 216 web-safe colours, and a custom colour (system wheel + hex field). One
// radiogroup with a single tab stop (roving tabindex); arrow keys move through
// the swatches in DOM order and select as they go, like native radios.
export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const hexId = useId();
  // What the hex field shows while the user is typing; null = mirror `value`.
  const [draft, setDraft] = useState<string | null>(null);

  const current = normaliseColor(value) ?? value;
  const hexText = draft ?? (isHexColor(current) ? current : "");
  const draftInvalid = draft !== null && draft !== "" && normaliseColor(draft.startsWith("#") ? draft : `#${draft}`) === null;
  const webSafeSelected = isHexColor(current) && WEB_SAFE_COLORS.includes(current);
  const [webSafeOpen, setWebSafeOpen] = useState(webSafeSelected);

  function pick(next: ColorValue) {
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

  // Exactly one radio is tabbable: the selected one, else the first.
  const anySelected = isNamedColor(current) || webSafeSelected;

  function swatch(key: string, colorValue: ColorValue, className: string, style: CSSProperties | undefined, cols: number, first: boolean) {
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
        tabIndex={selected || (!anySelected && first) ? 0 : -1}
        onClick={() => pick(colorValue)}
        className={[className, selected ? SWATCH_RING : "", SWATCH_FOCUS].join(" ")}
        style={style}
      />
    );
  }

  const chip = chipStyle(current);
  const bar = barStyle(current);
  const barContrast = isHexColor(current)
    ? contrastRatio(current, readableTextColor(current)).toFixed(1)
    : null;

  return (
    <div ref={groupRef} role="radiogroup" aria-label="Colour" onKeyDown={handleKeyDown} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-micro font-medium text-ink-2">Current palette</span>
        <div className="flex flex-wrap gap-2">
          {SEASON_COLOR_KEYS.map((key, i) =>
            swatch(key, key, `h-7 w-7 coarse:h-11 coarse:w-11 rounded-full border-2 ${barStyle(key).className}`, undefined, 7, i === 0)
          )}
        </div>
      </div>

      <details open={webSafeOpen} onToggle={(e) => setWebSafeOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer select-none text-micro font-medium text-ink-2 coarse:min-h-[44px] coarse:leading-[44px]">
          Web-safe colours (216)
        </summary>
        <div
          className="mt-1.5 grid w-max grid-cols-[repeat(12,max-content)] gap-0.5 coarse:grid-cols-[repeat(6,max-content)] coarse:gap-1"
        >
          {WEB_SAFE_COLORS.map((hex) =>
            swatch(hex, hex as ColorValue, "h-6 w-6 coarse:h-11 coarse:w-11 rounded-sm border border-black/10", { backgroundColor: hex }, WEB_SAFE_COLS, false)
          )}
        </div>
      </details>

      <div className="flex flex-col gap-1.5">
        <span className="text-micro font-medium text-ink-2">Custom</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a custom colour"
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
