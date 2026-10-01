"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

// Bumping this key (e.g. to v2) would re-trigger the auto-show for everyone,
// which is useful if the tour content changes substantially later.
const TOUR_SEEN_KEY = "evo_tour_seen_v1";

interface OnboardingTourContextValue {
  /** Open the tour modal. Ignores the localStorage "seen" check — always shows. */
  start: () => void;
  isOpen: boolean;
  /** Current step index (0-based). Used by OnboardingTourModal. */
  step: number;
  setStep: (step: number) => void;
  /**
   * Dismiss for this browser session only — does NOT mark the tour as
   * permanently seen in localStorage. Used by both the "Skip" button and
   * the Escape key, so an accidental skip/Escape doesn't permanently hide
   * the tour from someone who meant to keep going.
   */
  skip: () => void;
  /**
   * Dismiss AND mark the tour as permanently seen (localStorage). Only the
   * "Done" button on the last step should call this.
   */
  finish: () => void;
}

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  // On mount, auto-start the tour once for anyone who hasn't seen it yet.
  // Deferred to the next tick (setTimeout 0) rather than running synchronously
  // during render/mount, so it never blocks or competes with initial paint.
  useEffect(() => {
    const timer = setTimeout(() => {
      let seen: string | null = null;
      try {
        seen = window.localStorage.getItem(TOUR_SEEN_KEY);
      } catch {
        // localStorage can throw (private browsing, blocked storage) —
        // treat as "not seen" and just skip the auto-show rather than crash.
        return;
      }
      if (!seen) {
        setStep(0);
        setIsOpen(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Manual trigger (e.g. a future "Replay tour" nav item) — always shows the
  // tour from the start, regardless of whether it's been seen before.
  const start = useCallback(() => {
    setStep(0);
    setIsOpen(true);
  }, []);

  const skip = useCallback(() => {
    setIsOpen(false);
  }, []);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "true");
    } catch {
      // Ignore storage errors — worst case the tour auto-shows again next
      // visit, which is a harmless fallback.
    }
    setIsOpen(false);
  }, []);

  return (
    <OnboardingTourContext.Provider
      value={{ start, isOpen, step, setStep, skip, finish }}
    >
      {children}
    </OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour(): OnboardingTourContextValue {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) {
    throw new Error("useOnboardingTour must be used within an OnboardingTourProvider");
  }
  return ctx;
}
