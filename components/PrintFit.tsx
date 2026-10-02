"use client";

import { useEffect, useRef, ReactNode } from "react";
import { clippedHeight, findFitScale } from "@/lib/printFit";

// A4 landscape, 8mm @page margins (keep in sync with @page in globals.css).
// 1mm = 96/25.4 px.
const PAGE_W = Math.floor((297 - 16) * (96 / 25.4)); // 1062
const PAGE_H = Math.floor((210 - 16) * (96 / 25.4)); // 733
const SAFETY = 15; // px of slack so rounding never spills a line onto page 2
const FLOOR = 0.4;
const STEP = 0.02;
/** Fired on window after every fit; listeners read `[data-print-overflow]`. */
export const PRINT_FIT_EVENT = "evo:print-fit";

/**
 * Wraps the month grid and, just before printing (button OR Cmd/Ctrl+P),
 * scales it down so header + grid + footer fit one A4 landscape sheet.
 *
 * Measured under the same layout print will use: `html.printing` applies the
 * print layout rules (globals.css) on screen, and forces body to PAGE_W wide.
 * Screen layout and drag-and-drop are untouched; everything is undone on
 * `afterprint`.
 *
 * Multi-page print (/export/print): put each month in an ancestor marked
 * `data-print-page` and give it its own PrintFit. The footer is then looked up
 * inside that page and the height is measured from the page's top, so each
 * month is fitted to one sheet independently of the others. Without such an
 * ancestor (the home page) behaviour is the original document-level measure.
 */
export default function PrintFit({ className, children }: { className?: string; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;

    function reset() {
      html.classList.remove("printing");
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (outer) {
        outer.style.height = "";
        outer.style.overflow = "";
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
      const width = outer.clientWidth;
      if (width <= 0 || inner.scrollHeight <= 0) return; // grid not shown (e.g. phone agenda)

      const page = outer.closest<HTMLElement>("[data-print-page]");
      const footer = (page ?? document).querySelector<HTMLElement>(".print-footer");
      outer.style.overflow = "hidden";
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

      const avail = PAGE_H - SAFETY;
      const z = findFitScale(measure, avail, FLOOR, STEP);
      const end = measure(z); // leave the DOM at the chosen scale
      if (end > avail) {
        // Even the floor does not fit: clip (outer is overflow:hidden) rather
        // than spilling a stray second sheet, and flag it for the on-screen warning.
        outer.style.height = `${clippedHeight(outer.offsetHeight, end, avail)}px`;
        outer.dataset.printOverflow = "true";
      } else {
        delete outer.dataset.printOverflow;
      }
      window.dispatchEvent(new Event(PRINT_FIT_EVENT));
    }

    // Print preview pages (inside [data-print-page]) check once on load so the
    // too-busy warning shows before the user presses Print. The measure is
    // synchronous and undone before paint, so nothing flickers.
    let raf = 0;
    const precheck = () => {
      if (!outerRef.current?.closest("[data-print-page]")) return;
      fit();
      reset();
    };
    raf = requestAnimationFrame(precheck);
    document.fonts?.ready.then(precheck).catch(() => {});

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      reset();
    };
  }, []);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export { PAGE_W, PAGE_H };
