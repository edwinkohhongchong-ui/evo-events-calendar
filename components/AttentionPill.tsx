"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EventRow, OpenChecklistRow } from "@/lib/types";
import { computeAttention, totalOverdueItems } from "@/lib/eventChecklist";
import { formatDateDisplay, todayStr } from "@/lib/dates";
import { buildOwnerOptions, filterRowsByOwner, normalizeOwner, ownerMatches, OWNER_MAX } from "@/lib/owner";
import { buildOverdueSummary, overdueWithoutOwner } from "@/lib/overdueSummary";
import { useIsEditor } from "@/lib/roleContext";
import { useOwnerOptions } from "@/lib/useOwnerOptions";
import { FlagIcon } from "./icons";

// Same browser-remembered display name the checklist uses for "done by".
const MY_NAME_KEY = "evo-author-name";

const MAX_ROWS = 8;
const MAX_CHIPS = 8;

// "N overdue" pill in the month bar: unticked checklist items past their due
// date on any upcoming event (and events from the last two weeks), whatever
// month is on screen. Silent when nothing is overdue. Pull only: no unread or
// dismiss state, and nothing is ever sent anywhere.
export default function AttentionPill({ rows, onOpenEvent }: { rows: OpenChecklistRow[]; onOpenEvent: (event: EventRow) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isEditor = useIsEditor();
  const ownerOptions = useOwnerOptions(isEditor);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);
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
  function saveName(raw: string = draft) {
    const name = normalizeOwner(raw);
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
  // Names present on open items (plus the saved owner list for Editors), for chips and the no-match check.
  const namesInUse = useMemo(
    () => buildOwnerOptions([...rows.map((r) => r.owner), ...rows.map((r) => r.event.owner), ...ownerOptions]),
    [rows, ownerOptions],
  );
  // Overdue items nobody owns (neither the item nor its event): "Mine" can never show these.
  const unowned = useMemo(() => overdueWithoutOwner(rows, today), [rows, today]);
  const nameMatchesAny = namesInUse.some((n) => ownerMatches(n, myName));

  async function copySummary() {
    const text = buildOverdueSummary(rows, todayStr());
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  // Below sm the pill is only ~100px wide, so stretch the (absolutely
  // positioned) panel to the viewport edges. Stays absolute: a fixed panel
  // would be positioned against the sticky bar's backdrop-filter.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const wrap = wrapRef.current;
      if (!wrap || window.innerWidth >= 640) {
        setPanelStyle(undefined);
        return;
      }
      setPanelStyle({
        left: 12 - wrap.getBoundingClientRect().left,
        width: window.innerWidth - 24,
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

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
        data-tour="overdue-pill"
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
          style={panelStyle}
          className="absolute left-0 top-full z-40 mt-1.5 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-card bg-surface text-ink shadow-pop sm:w-[22rem]"
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
            {!myName && !asking && namesInUse.length > 0 && <OwnerChips label="Pick your name" names={namesInUse} onPick={saveName} />}
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
            {asking && namesInUse.length > 0 && <OwnerChips label="Owners in use" names={namesInUse} onPick={saveName} />}
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {mine && !nameMatchesAny && (
              <div className="flex flex-col gap-1.5 px-4 py-3">
                <p className="text-body text-ink-2">
                  No items match &ldquo;{myName}&rdquo;.
                  {namesInUse.length > 0 && <> Owners in use: {namesInUse.slice(0, MAX_CHIPS).join(", ")}</>}
                </p>
                <OwnerChips label="Use one of these names" names={namesInUse} onPick={saveName} />
              </div>
            )}
            {mine && nameMatchesAny && shown.length === 0 && (
              <p className="px-4 py-3 text-body text-ink-2">Nothing overdue is assigned to {myName}.</p>
            )}
            {mine && unowned > 0 && <p className="px-4 py-2 text-body font-medium text-ink">{unowned} overdue with no owner</p>}
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
          {isEditor && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2">
              <button
                type="button"
                onClick={copySummary}
                className="rounded-ctl px-2 py-1 text-body font-medium text-navy hover:underline [@media(pointer:coarse)]:min-h-[44px]"
              >
                Copy summary
              </button>
              <span role="status" className="text-micro text-ink-2">
                {copied === "ok" ? "Copied" : copied === "fail" ? "Couldn't copy" : ""}
              </span>
            </div>
          )}
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

function OwnerChips({ label, names, onPick }: { label: string; names: string[]; onPick: (name: string) => void }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {names.slice(0, MAX_CHIPS).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className="max-w-full truncate rounded-pill bg-fill px-3 py-1 text-body font-medium text-ink hover:bg-line [@media(pointer:coarse)]:min-h-[44px]"
        >
          {n}
        </button>
      ))}
    </div>
  );
}
