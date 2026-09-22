"use client";

import { createContext, useContext, ReactNode } from "react";
import { SeasonColorKey } from "./types";
import { suggestLevelColor } from "./levelColor";

// Resolved level-name -> color-key lookup, provided once at the calendar
// board / day view root so deeply-nested event-card components (reached
// through several layers that don't otherwise need level data — CalendarGrid,
// DayCell, DayViewEventBlock) can look up a color without threading a
// `levels` prop through all of them.
const LevelColorContext = createContext<Record<string, SeasonColorKey>>({});

export function LevelColorProvider({
  colorMap,
  children,
}: {
  colorMap: Record<string, SeasonColorKey>;
  children: ReactNode;
}) {
  return <LevelColorContext.Provider value={colorMap}>{children}</LevelColorContext.Provider>;
}

// Falls back to the hash-based suggestion (not a stored color) if the level
// name isn't in the map — e.g. an event whose level was deleted out from
// under it. Keeps rendering resilient instead of throwing on a bad lookup.
export function useLevelColor(levelName: string): SeasonColorKey {
  const map = useContext(LevelColorContext);
  return map[levelName] ?? suggestLevelColor(levelName);
}
