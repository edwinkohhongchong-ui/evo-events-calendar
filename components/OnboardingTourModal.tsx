"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboardingTour } from "@/lib/useOnboardingTour";
import { TOUR_STEPS } from "@/lib/tourSteps";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Rect = { top: number; left: number; width: number; height: number };

// Live-DOM spotlight tour: as the step advances, this navigates to the real
// page being discussed (step.route) and draws a highlight ring around the
// real element it's talking about (step.targetSelector). The step card
// itself stays in a fixed spot in the viewport — only the highlight moves.
export default function OnboardingTourModal() {
  const { isOpen, step, setStep, skip, finish } = useOnboardingTour();
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<Rect | null>(null);

  // Escape behaves exactly like "Skip" — session-only dismiss, not a
  // permanent "seen" mark — consistent with every other modal's Escape
  // handling in this app (see lib/useEscapeKey.ts).
  useEscapeKey(skip, isOpen);

  // The card is only mounted while open, so trap/restore focus around that.
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef, isOpen);
  // Next -> Done swaps the focused button out; keep focus inside the card.
  useEffect(() => {
    const card = cardRef.current;
    if (isOpen && card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }, [isOpen, step]);

  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];

  // Navigate to the step's route if we're not already there.
  useEffect(() => {
    if (!isOpen || !current) return;
    if (current.route && current.route !== pathname) {
      router.push(current.route);
    }
    // Only re-run when the step (or open state) changes — re-running on
    // every pathname change would fight with the user's own navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step]);

  // Locate and track the target element for the current step. The element
  // may not be mounted yet right after a route change (new page hasn't
  // rendered, or the hamburger menu hasn't opened yet), so retry across a
  // handful of animation frames before giving up silently for this step.
  useEffect(() => {
    if (!isOpen || !current?.targetSelector) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // ~0.5s at 60fps — generous for a route change + render

    const measure = (el: Element) => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector(current.targetSelector!);
      if (el) {
        measure(el);
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        rafId = requestAnimationFrame(tryFind);
      } else {
        // Element never showed up — omit the highlight rather than crash
        // or show a stale/broken ring.
        setRect(null);
      }
    };

    setRect(null);
    tryFind();

    const handleReflow = () => {
      const el = document.querySelector(current.targetSelector!);
      if (el) measure(el);
    };
    window.addEventListener("resize", handleReflow);
    window.addEventListener("scroll", handleReflow, true);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleReflow);
      window.removeEventListener("scroll", handleReflow, true);
    };
  }, [isOpen, step, current]);

  if (!isOpen) return null;

  const isFirst = step === 0;
  const isLast = step === total - 1;

  function handleBack() {
    setStep(Math.max(0, step - 1));
  }

  function handleNext() {
    setStep(Math.min(total - 1, step + 1));
  }

  // Keep the card out of the way of what it's pointing at: if the target
  // sits in the lower half of the viewport, the card moves to the top.
  const targetInLowerHalf = rect
    ? rect.top + rect.height / 2 > window.innerHeight / 2
    : false;

  const targetInRightHalf = rect
    ? rect.left + rect.width / 2 > window.innerWidth / 2
    : false;

  return (
    <>
      {/* Inert backdrop (a stray click shouldn't end the tour — use Skip or
          Escape). Dimmed only when there's no highlight ring; with a ring,
          the ring's own box-shadow does the dimming so the highlighted
          element itself stays bright. */}
      <div className={`fixed inset-0 z-50 ${rect ? "" : "bg-black/40"}`} />

      {rect && (
        <div
          className="fixed z-[51] rounded-lg pointer-events-none transition-all duration-150 ease-out"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 3px #D9A441, 0 0 0 9999px rgba(0,0,0,0.4)",
          }}
        />
      )}

      <div
        className={`fixed inset-x-0 ${
          targetInLowerHalf ? "top-0 sm:top-20" : "bottom-0 sm:bottom-6"
        } ${
          targetInRightHalf ? "sm:left-6 sm:right-auto sm:justify-start" : "sm:right-6 sm:left-auto sm:justify-end"
        } z-[52] flex justify-center p-4 pointer-events-none`}
      >
        <div
          ref={cardRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="evo-tour-title"
          aria-describedby="evo-tour-body"
          className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 flex flex-col gap-6 pointer-events-auto outline-none"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ink-2 tracking-wide">
              Step {step + 1} of {total}
            </p>
            <h2 id="evo-tour-title" className="text-lg font-semibold text-navy">{current.title}</h2>
            <p id="evo-tour-body" className="text-sm text-gray-600 leading-relaxed">{current.body}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-4 bg-gold" : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={skip}
              className="text-sm text-ink-2 hover:text-gray-600 coarse:min-h-[44px] coarse:px-3"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-1.5 coarse:min-h-[44px] text-sm rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={finish}
                  className="px-4 py-1.5 coarse:min-h-[44px] text-sm rounded-full bg-navy text-white hover:opacity-90"
                >
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-1.5 coarse:min-h-[44px] text-sm rounded-full bg-navy text-white hover:opacity-90"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
