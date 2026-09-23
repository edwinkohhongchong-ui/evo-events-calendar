"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

// null = no filter active, every category shows (the default). A non-null
// set names exactly which categories are visible — kept as level *names*
// (not ids) since that's what EventRow.level and occurrence.event.level
// carry, and what every rendering component already has in hand.
interface EventFilterContextValue {
  activeLevels: Set<string> | null;
  isVisible: (levelName: string) => boolean;
  toggleLevel: (levelName: string, allLevelNames: string[]) => void;
  showOnly: (levelName: string) => void;
  showAll: () => void;
}

const EventFilterContext = createContext<EventFilterContextValue | null>(null);

// Mounted once at the root layout (not per-page) so the filter a leader sets
// on the month view survives navigating into a day view or another screen —
// see PROJECT decision in app/layout.tsx.
export function EventFilterProvider({ children }: { children: ReactNode }) {
  const [activeLevels, setActiveLevels] = useState<Set<string> | null>(null);

  const isVisible = useCallback(
    (levelName: string) => !activeLevels || activeLevels.has(levelName),
    [activeLevels]
  );

  const toggleLevel = useCallback((levelName: string, allLevelNames: string[]) => {
    setActiveLevels((prev) => {
      const base = prev ?? new Set(allLevelNames);
      const next = new Set(base);
      if (next.has(levelName)) next.delete(levelName);
      else next.add(levelName);
      // Back to everything selected — collapse to "no filter" so newly
      // created categories aren't silently hidden by a stale full set.
      if (next.size >= allLevelNames.length) return null;
      return next;
    });
  }, []);

  const showOnly = useCallback((levelName: string) => setActiveLevels(new Set([levelName])), []);
  const showAll = useCallback(() => setActiveLevels(null), []);

  const value = useMemo(
    () => ({ activeLevels, isVisible, toggleLevel, showOnly, showAll }),
    [activeLevels, isVisible, toggleLevel, showOnly, showAll]
  );

  return <EventFilterContext.Provider value={value}>{children}</EventFilterContext.Provider>;
}

export function useEventFilter() {
  const ctx = useContext(EventFilterContext);
  if (!ctx) throw new Error("useEventFilter must be used within EventFilterProvider");
  return ctx;
}
