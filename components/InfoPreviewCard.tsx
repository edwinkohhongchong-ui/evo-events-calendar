"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { useDndContext } from "@dnd-kit/core";
import { HolidayRow, SeasonRow } from "@/lib/types";
import { parseDateStr } from "@/lib/dates";
import Pill from "./ui/Pill";

const SHOW_DELAY_MS = 150;
const CARD_WIDTH = 260;
const EST_HEIGHT = 120;

type Anchor = { left: number; top: number; bottom: number };

// Sibling of useEventPreview (EventPreviewCard.tsx) for holiday labels and
// season bars: same delay, fixed positioning, z-60 and hide-on-scroll/resize/
// Escape/drag. Mouse hover or keyboard focus-visible only; a tap is unchanged.
// Spread `bind` on the trigger and render `card` anywhere (portals to <body>).
function useInfoPreview(content: ReactNode) {
  const { active } = useDndContext();
  const suppress = active != null;
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback(() => {
    clear();
    setAnchor(null);
  }, [clear]);
  const show = useCallback(
    (el: HTMLElement) => {
      clear();
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setAnchor({ left: r.left, top: r.top, bottom: r.bottom });
      }, SHOW_DELAY_MS);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);
  useEffect(() => {
    if (suppress) hide();
  }, [suppress, hide]);
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, hide]);

  const bind = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && !suppress) show(e.currentTarget);
    },
    onPointerLeave: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (!suppress && e.target.matches(":focus-visible")) show(e.currentTarget);
    },
    onBlur: hide,
  };

  const card = anchor ? <Card anchor={anchor}>{content}</Card> : null;
  return { bind, card, hide };
}

function Card({ anchor, children }: { anchor: Anchor; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - 8));
  const above = anchor.bottom + EST_HEIGHT + 12 > window.innerHeight && anchor.top > EST_HEIGHT;
  const style = above
    ? { left, width: CARD_WIDTH, bottom: window.innerHeight - anchor.top + 6 }
    : { left, width: CARD_WIDTH, top: anchor.bottom + 6 };

  return createPortal(
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-[60] flex flex-col gap-1.5 rounded-card bg-surface p-3.5 text-body text-ink shadow-pop"
    >
      {children}
    </div>,
    document.body
  );
}

// Clamped: the hover card is a glance; clicking opens the full text.
function PreviewDetails({ text }: { text: string }) {
  return <div className="line-clamp-4 whitespace-pre-wrap break-words border-t border-line pt-1.5 text-ink-2">{text}</div>;
}

const fmt = (d: string) => format(parseDateStr(d), "EEE d MMM yyyy");

export function useHolidayPreview(holiday: HolidayRow) {
  return useInfoPreview(
    <>
      <div className="text-ui font-semibold leading-snug">{holiday.name}</div>
      <div className="text-ink-2">{fmt(holiday.holiday_date)}</div>
      <div>
        <Pill variant="neutral">{holiday.type}</Pill>
      </div>
      {holiday.details && <PreviewDetails text={holiday.details} />}
    </>
  );
}

export function useSeasonPreview(season: SeasonRow) {
  const range =
    season.start_date === season.end_date ? fmt(season.start_date) : `${fmt(season.start_date)} – ${fmt(season.end_date)}`;
  return useInfoPreview(
    <>
      <div className="text-ui font-semibold leading-snug">{season.name}</div>
      <div className="text-ink-2">{range}</div>
      <div>
        <Pill variant="neutral">{season.category}</Pill>
      </div>
      {season.notes && <PreviewDetails text={season.notes} />}
    </>
  );
}
