"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { LevelRow } from "@/lib/types";
import { createEvent } from "@/lib/actions";
import { unwrap } from "@/lib/actionResult";
import { dotStyle } from "@/lib/colorStyle";
import { formatDateDisplay, isValidDateStr } from "@/lib/dates";
import { useLevelColor } from "@/lib/levelColorContext";
import { useUndo } from "@/lib/undo/UndoProvider";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  buildQuickAddValues,
  DATE_INPUT_MAX,
  DATE_INPUT_MIN,
  defaultQuickLevel,
  displayCategoryFor,
  eventTypeButtonNames,
  placePopover,
  readLastQuickLevel,
  validateQuickAdd,
  writeLastQuickLevel,
  zoneLevelsOf,
} from "@/lib/quickAdd";
import Button from "./ui/Button";
import { INPUT, LABEL } from "./ui/fieldStyles";

export interface QuickAddDraft {
  name: string;
  date: string;
  time: string;
  level: string;
}

interface QuickAddPopoverProps {
  date: string;
  /** The clicked day cell; the popover sits beside it on desktop. */
  anchor: HTMLElement | null;
  levels: LevelRow[];
  onClose: () => void;
  onSaved: () => void;
  onMoreOptions: (draft: QuickAddDraft) => void;
}

const WIDTH = 320;

function CategoryDot({ levelName }: { levelName: string }) {
  const dot = dotStyle(useLevelColor(levelName));
  return <span className={`h-2 w-2 shrink-0 rounded-full ${dot.className}`} style={dot.style} aria-hidden="true" />;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function useIsCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return coarse;
}

// Quick add for the month grid: name + optional time + Event type, saved in
// one step. Rendered through a portal because the sticky month bar's
// backdrop-filter would otherwise become the containing block of anything
// fixed. Anchored beside the day on desktop, a bottom sheet below `sm`.
export default function QuickAddPopover({ date: initialDate, anchor, levels, onClose, onSaved, onMoreOptions }: QuickAddPopoverProps) {
  const { record } = useUndo();
  const ref = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  const coarse = useIsCoarse();
  const nameRef = useRef<HTMLInputElement>(null);
  const focusedOnce = useRef(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [level, setLevel] = useState(() => defaultQuickLevel(readLastQuickLevel(), levels));
  // The pre-selected type came from the last quick add, not from the user's pick this time.
  const [lastUsed, setLastUsed] = useState(level);
  const [zonePicked, setZonePicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEscapeKey(onClose);
  useFocusTrap(ref);

  // Click/tap anywhere outside closes (also covers starting a drag or opening
  // another day or event). Registered on pointerdown so a click that opens
  // something else still gets to run afterwards.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!desktop || !anchor) return;
    function place() {
      const el = ref.current;
      if (!el || !anchor) return;
      const r = anchor.getBoundingClientRect();
      setPos(
        placePopover(
          { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          { width: el.offsetWidth, height: el.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // error/zonePicked change the height, so re-place when they do.
  }, [desktop, anchor, error, zonePicked, level]);

  // The card is visibility:hidden until placed on desktop, and a hidden input
  // can't take focus, so focus once it is visible. Skipped on touch: the
  // on-screen keyboard would cover Save.
  const visible = !desktop || !!pos;
  useEffect(() => {
    if (!visible || coarse || focusedOnce.current) return;
    focusedOnce.current = true;
    nameRef.current?.focus();
  }, [visible, coarse]);

  const zoneLevels = zoneLevelsOf(levels);
  const buttons = eventTypeButtonNames(levels);
  const active = displayCategoryFor(level, zonePicked);

  function pickCategory(cat: string) {
    setError(null);
    setLastUsed("");
    if (cat !== "Zone") {
      setZonePicked(false);
      setLevel(cat);
    } else if (displayCategoryFor(level) !== "Zone") {
      // Same as the full form: no zone is pre-selected, the user must choose.
      setLevel("");
      setZonePicked(true);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const input = {
      name,
      date,
      time,
      level,
      zonePickedWithoutLevel: zonePicked,
    };
    const problem = validateQuickAdd(input, levels);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const values = buildQuickAddValues(input);
      const affected = unwrap(await createEvent(values));
      record(`Add "${values.name}"`, affected);
      writeLastQuickLevel(level);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving this event. Check your connection and try again. Your details are still in the form.");
      setSaving(false);
    }
  }

  const placed = desktop && pos;
  const card = (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Quick add event"
      style={
        desktop
          ? {
              position: "fixed",
              width: WIDTH,
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: placed ? "visible" : "hidden",
            }
          : undefined
      }
      className={[
        "z-50 outline-none bg-surface shadow-pop evo-modal-card",
        desktop ? "rounded-card p-3.5" : "fixed inset-x-0 bottom-0 flex max-h-[85vh] max-h-[85dvh] flex-col rounded-t-modal px-4 pt-2",
      ].join(" ")}
      onClick={(e) => e.stopPropagation()}
    >
      {!desktop && <div className="mx-auto mb-2 h-1 w-9 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />}
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
          <div className="text-chip font-medium text-ink-2">{isValidDateStr(date) ? formatDateDisplay(date) : "Add event"}</div>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Event name</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className={INPUT}
              autoComplete="off"
              maxLength={200}
            />
          </label>
          <div className={desktop ? "flex flex-col gap-3" : "grid grid-cols-2 gap-3 [&>label]:min-w-0"}>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Date</span>
              <input
                type="date"
                value={date}
                min={DATE_INPUT_MIN}
                max={DATE_INPUT_MAX}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>{desktop ? "Start time (optional)" : "Time (optional)"}</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={INPUT} />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`${LABEL} flex items-center gap-2`}>
              Event type
              {lastUsed && level === lastUsed && (
                <span className="rounded-pill bg-fill px-2 text-chip font-medium text-ink-2">Last used</span>
              )}
            </span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Event type">
              {buttons.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active === cat}
                  onClick={() => pickCategory(cat)}
                  className={[
                    "inline-flex min-h-[36px] coarse:min-h-[44px] min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3 text-body font-medium transition-colors duration-fast",
                    active === cat ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
                  ].join(" ")}
                >
                  {(cat !== "Zone" || level) && <CategoryDot levelName={cat === "Zone" ? level : cat} />}
                  {cat}
                </button>
              ))}
            </div>
            {active === "Zone" && !desktop && (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Zone">
                {zoneLevels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={level === l.name}
                    onClick={() => {
                      setLevel(l.name);
                      setZonePicked(false);
                      setLastUsed("");
                      setError(null);
                    }}
                    className={[
                      "inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-pill px-3 text-body font-medium transition-colors duration-fast",
                      level === l.name ? "bg-navy text-white" : "bg-fill text-ink hover:bg-line",
                    ].join(" ")}
                  >
                    <CategoryDot levelName={l.name} />
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            {active === "Zone" && desktop && (
              <select
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value);
                  setZonePicked(false);
                  setLastUsed("");
                  setError(null);
                }}
                aria-label="Zone"
                className={INPUT}
              >
                {!level && (
                  <option value="" disabled>
                    — Select zone —
                  </option>
                )}
                {zoneLevels.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && (
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
          )}
        </div>
        <div
          className={`flex shrink-0 flex-col gap-2 ${
            desktop ? "pt-1" : "border-t border-line bg-surface pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {level && (
            <p className="text-body text-ink-2">
              Saving as <strong className="font-semibold text-ink">{level}</strong>
              {lastUsed && level === lastUsed ? " (last used)" : ""}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                onMoreOptions({
                  name: name.trim(),
                  date: isValidDateStr(date) ? date : initialDate,
                  time,
                  level,
                })
              }
              className="min-h-[32px] coarse:min-h-[44px] text-body font-medium text-navy hover:underline"
            >
              More options
            </button>
            <Button type="submit" loading={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );

  return createPortal(desktop ? card : <div className="fixed inset-0 z-50 bg-ink/40 evo-modal-backdrop">{card}</div>, document.body);
}
