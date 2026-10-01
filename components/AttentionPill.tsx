"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EventRow, OpenChecklistRow } from "@/lib/types";
import { computeAttention, totalOverdueItems } from "@/lib/eventChecklist";
import { formatDateDisplay, toDateStr } from "@/lib/dates";
import { FlagIcon } from "./icons";

const MAX_ROWS = 8;

// "N overdue" pill in the month bar: unticked checklist items past their due
// date on any upcoming event (and events from the last two weeks), whatever
// month is on screen. Silent when nothing is overdue. Pull only: no unread or
// dismiss state, and nothing is ever sent anywhere.
export default function AttentionPill({
  rows,
  onOpenEvent,
}: {
  rows: OpenChecklistRow[];
  onOpenEvent: (event: EventRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const today = toDateStr(new Date());
  const events = useMemo(() => computeAttention(rows, today), [rows, today]);
  const total = useMemo(() => totalOverdueItems(rows, today), [rows, today]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (total === 0) return null;
  const shown = events.slice(0, MAX_ROWS);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${total} overdue checklist ${total === 1 ? "item" : "items"}`}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill bg-danger/10 px-3.5 text-body font-medium text-danger transition-colors duration-fast hover:bg-danger/15 [@media(pointer:coarse)]:min-h-[44px]"
      >
        <FlagIcon className="!h-4 !w-4" />
        {total} overdue
      </button>

      {open && (
        <div
          role="group"
          aria-label="Overdue checklist items"
          className="absolute left-0 top-full z-40 mt-1.5 w-full overflow-hidden rounded-card bg-surface text-ink shadow-pop sm:w-[22rem]"
        >
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {shown.map((a) => (
              <button
                key={a.event.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenEvent(a.event);
                }}
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors duration-fast hover:bg-canvas [@media(pointer:coarse)]:min-h-[52px]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-ui font-medium">{a.event.name}</span>
                  <span className="shrink-0 text-micro text-ink-2">{formatDateDisplay(a.event.event_date)}</span>
                </span>
                <span className="text-body text-danger">
                  {a.worstItem}, {a.daysLate} {a.daysLate === 1 ? "day" : "days"} late
                  {a.moreCount > 0 && <span className="text-ink-2"> · +{a.moreCount} more</span>}
                </span>
              </button>
            ))}
          </div>
          {events.length > shown.length && (
            <p className="border-t border-line px-4 py-2 text-micro text-ink-2">
              +{events.length - shown.length} more events with overdue items
            </p>
          )}
        </div>
      )}
    </div>
  );
}
