"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EventRow, OpenChecklistRow } from "@/lib/types";
import { computeAttention, totalOverdueItems } from "@/lib/eventChecklist";
import { formatDateDisplay, todayStr } from "@/lib/dates";
import { filterRowsByOwner, normalizeOwner, OWNER_MAX } from "@/lib/owner";
import { FlagIcon } from "./icons";

// Same browser-remembered display name the checklist uses for "done by".
const MY_NAME_KEY = "evo-author-name";

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
  const today = todayStr();
  // "Mine" filter: the viewer's own name, remembered in this browser only.
  const [myName, setMyName] = useState("");
  const [mine, setMine] = useState(false);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    try {
      setMyName(normalizeOwner(localStorage.getItem(MY_NAME_KEY)));
    } catch {
      /* no saved name; the toggle asks for one */
    }
  }, []);
  function saveName() {
    const name = normalizeOwner(draft);
    if (!name) return;
    setMyName(name);
    setMine(true);
    setAsking(false);
    try {
      localStorage.setItem(MY_NAME_KEY, name);
    } catch {
      /* remembered for this visit only */
    }
  }
  function toggleMine() {
    if (mine) setMine(false);
    else if (myName) setMine(true);
    else setAsking(true);
  }
  const visibleRows = useMemo(() => (mine ? filterRowsByOwner(rows, myName) : rows), [mine, rows, myName]);
  const events = useMemo(() => computeAttention(visibleRows, today), [visibleRows, today]);
  // The pill's count always covers everything overdue; "Mine" only narrows the list.
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
          <div className="flex flex-col gap-1.5 border-b border-line px-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleMine}
                aria-pressed={mine}
                className={`rounded-pill px-3 py-1 text-body font-medium transition-colors duration-fast [@media(pointer:coarse)]:min-h-[44px] ${
                  mine ? "bg-navy text-white" : "bg-fill text-ink-2 hover:bg-line"
                }`}
              >
                Mine
              </button>
              {myName && !asking && (
                <span className="truncate text-micro text-ink-2">
                  {myName}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(myName);
                      setAsking(true);
                    }}
                    className="font-medium text-navy hover:underline"
                  >
                    change
                  </button>
                </span>
              )}
            </div>
            {asking && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={OWNER_MAX}
                  placeholder="Your name, as it appears under Owner"
                  aria-label="Your name"
                  className="min-h-[36px] min-w-0 flex-1 rounded-ctl border border-line bg-surface px-2.5 text-body text-ink"
                />
                <button
                  type="submit"
                  disabled={!normalizeOwner(draft)}
                  className="rounded-ctl bg-navy px-3 py-1.5 text-body font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {mine && shown.length === 0 && (
              <p className="px-4 py-3 text-body text-ink-2">Nothing overdue is assigned to {myName}.</p>
            )}
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
