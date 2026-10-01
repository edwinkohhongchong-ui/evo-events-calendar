"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

// Bumping this key (e.g. to v2) would re-trigger the auto-show for everyone,
// which is useful if the tour content changes substantially later.
const TOUR_SEEN_KEY = "evo_tour_seen_v1";
// Skip/Escape lasts for this browser tab's session only (sessionStorage), so a
// reload doesn't reopen the tour, but a new visit later still offers it.
const TOUR_SKIPPED_KEY = "evo_tour_skipped_session";

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
  const pathname = usePathname();
  const router = useRouter();

  // Auto-start the tour once for anyone who hasn't seen it yet. Never on the
  // login page (nobody is signed in there, and the tour's steps point at the
  // signed-in app) — the check re-runs on route change so it fires right
  // after sign-in. Deferred a tick so it never competes with initial paint.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || pathname.startsWith("/login")) return;
    const timer = setTimeout(() => {
      let seen: string | null = null;
      let skippedThisSession: string | null = null;
      try {
        seen = window.localStorage.getItem(TOUR_SEEN_KEY);
        skippedThisSession = window.sessionStorage.getItem(TOUR_SKIPPED_KEY);
      } catch {
        // Storage can throw (private browsing, blocked storage) — skip the
        // auto-show rather than crash.
        return;
      }
      autoStarted.current = true;
      if (!seen && !skippedThisSession) {
        setStep(0);
        setIsOpen(true);
        // Step 1 expects to be on the calendar page.
        if (pathname !== "/") router.push("/");
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Manual trigger (e.g. the "Replay tour" nav item) — always shows the tour
  // from the start, regardless of whether it's been seen before. Step 1
  // expects to be on the calendar ("/"), so navigate there first if needed;
  // the step-change effect in OnboardingTourModal takes over from there for
  // every step after this one.
  const start = useCallback(() => {
    setStep(0);
    setIsOpen(true);
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  const skip = useCallback(() => {
    try {
      window.sessionStorage.setItem(TOUR_SKIPPED_KEY, "true");
    } catch {
      // Ignore — worst case the tour reopens on the next reload.
    }
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
