"use client";

import { useOnboardingTour } from "@/lib/useOnboardingTour";
import { TOUR_STEPS } from "@/lib/tourSteps";
import { useEscapeKey } from "@/lib/useEscapeKey";

// Simple sequential card/modal onboarding walkthrough — not a live-DOM
// spotlight tour. Auto-opens on first visit (see useOnboardingTour.tsx) and
// can be replayed later via useOnboardingTour().start(). Render this once,
// near the other top-level providers/modals in app/layout.tsx.
export default function OnboardingTourModal() {
  const { isOpen, step, setStep, skip, finish } = useOnboardingTour();

  // Escape behaves exactly like "Skip" — session-only dismiss, not a
  // permanent "seen" mark — consistent with every other modal's Escape
  // handling in this app (see lib/useEscapeKey.ts).
  useEscapeKey(() => {
    if (isOpen) skip();
  });

  if (!isOpen) return null;

  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  function handleBack() {
    setStep(Math.max(0, step - 1));
  }

  function handleNext() {
    setStep(Math.min(total - 1, step + 1));
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={skip}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400 tracking-wide">
            Step {step + 1} of {total}
          </p>
          <h2 className="text-lg font-semibold text-navy">{current.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{current.body}</p>
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
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-1.5 text-sm rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={finish}
                className="px-4 py-1.5 text-sm rounded-full bg-navy text-white hover:opacity-90"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-1.5 text-sm rounded-full bg-navy text-white hover:opacity-90"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
