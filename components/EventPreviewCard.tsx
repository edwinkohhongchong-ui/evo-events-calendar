"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { EventOccurrence } from "@/lib/types";
import { dotStyle } from "@/lib/colorStyle";
import { useLevelColor } from "@/lib/levelColorContext";
import { formatDateDisplay, formatEventTimeRange } from "@/lib/dates";
import { CheckSquareIcon, ClockIcon, MapPinIcon, RepeatIcon, StickyNoteIcon } from "./icons";
import { useEventChecklistProgress } from "@/lib/eventChecklistContext";
import { progressOverdue } from "@/lib/eventChecklist";
import { todayStr } from "@/lib/dates";

const SHOW_DELAY_MS = 150;
const CARD_WIDTH = 280;
const EST_HEIGHT = 190;

type Anchor = { left: number; top: number; bottom: number };

// Hover (mouse) / focus (keyboard) preview for event chips and bars. Touch
// users never see it — a tap opens the normal event dialog. Pass `suppress`
// while the chip is being dragged. Spread `bind` onto the chip's root element
// and render `card` anywhere (it portals to <body>).
export function useEventPreview(occurrence: EventOccurrence, suppress = false) {
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
  // A scroll or window resize would leave the card floating in the wrong place.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
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

  const card = anchor ? <PreviewCard occurrence={occurrence} anchor={anchor} /> : null;
  return { bind, card, hide };
}

function PreviewCard({ occurrence, anchor }: { occurrence: EventOccurrence; anchor: Anchor }) {
  const { event } = occurrence;
  const color = useLevelColor(event.level);
  const checklist = useEventChecklistProgress(event.id);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const time = formatEventTimeRange(occurrence.startTime, occurrence.endTime);
  const multiDay = occurrence.spanEndDate !== occurrence.occurrenceDate;
  const subtitle =
    event.event_type === "Gathering" ? [event.series, event.sermon_title].filter(Boolean).join(" — ") : "";
  const notes = event.notes ? (event.notes.length > 140 ? `${event.notes.slice(0, 140)}…` : event.notes) : "";

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
      <div className="flex items-center gap-1.5 text-micro font-medium text-ink-2">
        <span className={`h-2 w-2 rounded-full ${dotStyle(color).className}`} style={dotStyle(color).style} aria-hidden="true" />
        {event.level}
        <span className="text-ink-3">· {event.event_type}</span>
      </div>
      <div className="text-ui font-semibold leading-snug">{event.name}</div>
      {subtitle && <div className="text-ink-2">{subtitle}</div>}
      <div className="text-ink-2">
        {formatDateDisplay(occurrence.occurrenceDate)}
        {multiDay && <> – {formatDateDisplay(occurrence.spanEndDate)}</>}
      </div>
      {time && (
        <div className="flex items-center gap-1.5 text-ink-2">
          <ClockIcon className="!h-4 !w-4" />
          {time}
        </div>
      )}
      {event.location && (
        <div className="flex items-center gap-1.5 text-ink-2">
          <MapPinIcon className="!h-4 !w-4" />
          {event.location}
        </div>
      )}
      {event.owner && (
        <div className="text-ink-2">
          <span className="font-medium">Owner:</span> {event.owner}
        </div>
      )}
      {checklist && checklist.total > 0 && (
        <div
          className={[
            "flex items-center gap-1.5",
            progressOverdue(checklist, event.event_date, todayStr()) ? "font-medium text-danger" : "text-ink-2",
          ].join(" ")}
        >
          <CheckSquareIcon className="!h-4 !w-4" />
          Checklist {checklist.done}/{checklist.total}
          {progressOverdue(checklist, event.event_date, todayStr()) && " · overdue"}
        </div>
      )}
      {event.recurring !== "None" && (
        <div className="flex items-center gap-1.5 text-ink-2">
          <RepeatIcon className="!h-4 !w-4" />
          Repeats {event.recurring.toLowerCase()}
        </div>
      )}
      {notes && (
        <div className="flex items-start gap-1.5 border-t border-line pt-1.5 text-ink-2">
          <StickyNoteIcon className="!h-4 !w-4 mt-0.5" />
          <span className="whitespace-pre-wrap">{notes}</span>
        </div>
      )}
    </div>,
    document.body
  );
}
