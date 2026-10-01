"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Toast from "./ui/Toast";

// "Lead me to the item": reads ?focus=kind:value (set by notification links),
// scrolls the matching element into view, pulses it, then strips the param so
// a refresh doesn't replay it. Renders nothing except the "not found" toast.
//
// Targets are located by data attributes: [data-event-id], [data-date],
// [data-season-id], [data-notes-panel]. After a cross-month navigation the new
// month's DOM can arrive a beat after the param changes, so lookups retry
// briefly before giving up.

const RETRY_MS = 100;
const MAX_WAIT_MS = 1800;
const PULSE_MS = 2600;

function esc(v: string) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"');
}

function findTargets(kind: string, value: string): HTMLElement[] {
  const q = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
  switch (kind) {
    case "event":
      return q(`[data-event-id="${esc(value)}"]`);
    case "holiday":
    case "day":
      return q(`[data-date="${esc(value)}"]`);
    case "season":
      return q(`[data-season-id="${esc(value)}"]`);
    case "notes":
      return q("[data-notes-panel]");
    default:
      return [];
  }
}

export default function FocusHighlighter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const focus = params.get("focus");
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!focus) return;
    const sep = focus.indexOf(":");
    const kind = sep === -1 ? focus : focus.slice(0, sep);
    const value = sep === -1 ? "" : focus.slice(sep + 1);

    let cancelled = false;
    const timers: number[] = [];
    const started = Date.now();

    const stripParam = () => {
      const next = new URLSearchParams(window.location.search);
      next.delete("focus");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    const attempt = () => {
      if (cancelled) return;
      const targets = findTargets(kind, value);
      if (targets.length > 0) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        targets[0].scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
        for (const el of targets) {
          el.classList.remove("evo-focus-pulse");
          void el.offsetWidth; // restart the animation
          el.classList.add("evo-focus-pulse");
          // Not tracked in `timers`: stripping the param re-runs this effect's
          // cleanup, which must not cancel the pulse removal.
          window.setTimeout(() => el.classList.remove("evo-focus-pulse"), PULSE_MS);
        }
        stripParam();
        return;
      }
      if (Date.now() - started < MAX_WAIT_MS) {
        timers.push(window.setTimeout(attempt, RETRY_MS));
        return;
      }
      setToast(true);
      stripParam();
    };
    attempt();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [focus, pathname, router]);

  // Separate from the focus effect: stripping the param re-runs that effect's
  // cleanup, which would otherwise cancel the auto-dismiss timer.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return <Toast message="That item is no longer on the calendar." onDismiss={() => setToast(false)} />;
}
