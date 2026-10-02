"use client";

import { useEffect, useRef, ReactNode } from "react";
import { clippedHeight, findFitScale, maxFitScale, FIT_SAFETY } from "@/lib/printFit";
import {
  DEFAULT_ORIENT,
  DEFAULT_PAPER,
  Orient,
  PaperId,
  pageRule,
  printableArea,
  readStoredPaper,
} from "@/lib/paper";

const FLOOR = 0.4;
const STEP = 0.02;
const RECHECKS = 3; // extra tighten passes after the first fit
/** Width the print CSS (font sizes, row heights) was tuned for; wider paper scales up from it. */
const BASE_W = 1062;
/** Fired on window after every fit; listeners read `[data-print-overflow]`. */
export const PRINT_FIT_EVENT = "evo:print-fit";

/**
 * Wraps the month grid and, just before printing (button OR Cmd/Ctrl+P),
 * scales it so header + grid + footer fit ONE sheet of the chosen paper.
 *
 * Paper: pass `paper`/`orient` (Print Calendar page, which also injects the
 * matching @page). Without them (home page) the remembered choice in
 * localStorage is used, default A4 landscape, and this component injects the
 * @page rule itself.
 *
 * Measured under the same layout print will use: `html.printing` applies the
 * print layout rules (globals.css) on screen, and body is forced to the
 * printable width. Content is fitted to FIT_SAFETY of the page height so small
 * print-vs-screen wrap differences cannot push it past the sheet; nothing is
 * clipped unless even the scale floor does not fit (then the busy warning shows).
 *
 * Multi-page print (/export/print): put each month in an ancestor marked
 * `data-print-page` and give it its own PrintFit; the footer is looked up inside
 * that page and height measured from its top.
 */
export default function PrintFit({
  className,
  children,
  paper,
  orient,
}: {
  className?: string;
  children: ReactNode;
  paper?: PaperId;
  orient?: Orient;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const controlled = paper !== undefined && orient !== undefined;
    const choice = () =>
      controlled ? { paper, orient } : readStoredPaper() ?? { paper: DEFAULT_PAPER, orient: DEFAULT_ORIENT };

    // Home page: no toolbar, so apply the remembered paper to @page ourselves.
    let styleEl: HTMLStyleElement | null = null;
    if (!controlled) {
      const c = choice();
      styleEl = document.createElement("style");
      styleEl.textContent = pageRule(c.paper as PaperId, c.orient as Orient);
      document.head.appendChild(styleEl);
    }

    function reset() {
      html.classList.remove("printing");
      document.body.style.width = "";
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (outer) {
        outer.style.height = "";
        outer.style.overflow = "";
        outer.style.breakInside = "";
      }
      if (inner) {
        inner.style.width = "";
        inner.style.transform = "";
        inner.style.transformOrigin = "";
      }
    }

    function fit() {
      const outer = outerRef.current;
      const inner = innerRef.current;
      reset();
      html.classList.add("printing");
      if (!outer || !inner) return;
      const c = choice();
      const area = printableArea(c.paper as PaperId, c.orient as Orient);
      document.body.style.width = `${area.width}px`;
      const width = outer.clientWidth;
      if (width <= 0 || inner.scrollHeight <= 0) return; // grid not shown (e.g. phone agenda)

      const page = outer.closest<HTMLElement>("[data-print-page]");
      const footer = (page ?? document).querySelector<HTMLElement>(".print-footer");
      outer.style.overflow = "visible";
      outer.style.breakInside = "avoid";
      inner.style.transformOrigin = "top left";

      // Content end (document px) at scale z: bottom of the footer, i.e. the
      // header, grid and footer all counted, whatever their heights.
      const measure = (z: number) => {
        inner.style.width = `${width / z}px`;
        inner.style.transform = `scale(${z})`;
        outer.style.height = `${Math.ceil(inner.scrollHeight * z)}px`;
        const endEl = footer && footer.offsetParent !== null ? footer : outer;
        const origin = page ? page.getBoundingClientRect().top + window.scrollY : 0;
        return endEl.getBoundingClientRect().bottom + window.scrollY - origin;
      };

      const avail = area.height * FIT_SAFETY;
      const max = maxFitScale(area.width, BASE_W);
      let z = findFitScale(measure, avail, FLOOR, STEP, max);
      let end = measure(z); // leave the DOM at the chosen scale
      // Re-measure after the final layout and tighten if it still overshoots.
      for (let i = 0; i < RECHECKS && end > avail && z - STEP >= FLOOR - 1e-9; i++) {
        z = Math.round((z - STEP) * 1000) / 1000;
        end = measure(z);
      }
      if (end > avail) {
        // Even the floor does not fit: clip to the real page rather than
        // spilling a stray second sheet, and flag it for the on-screen warning.
        outer.style.overflow = "hidden";
        outer.style.height = `${clippedHeight(outer.offsetHeight, end, area.height - 8)}px`;
        outer.dataset.printOverflow = "true";
      } else {
        delete outer.dataset.printOverflow;
      }
      window.dispatchEvent(new Event(PRINT_FIT_EVENT));
    }

    // Print preview pages (inside [data-print-page]) check once on load so the
    // too-busy warning shows before the user presses Print. The measure is
    // synchronous and undone before paint, so nothing flickers.
    const precheck = () => {
      if (!outerRef.current?.closest("[data-print-page]")) return;
      fit();
      reset();
    };
    const raf = requestAnimationFrame(precheck);
    document.fonts?.ready.then(precheck).catch(() => {});

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      reset();
      styleEl?.remove();
    };
  }, [paper, orient]);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
