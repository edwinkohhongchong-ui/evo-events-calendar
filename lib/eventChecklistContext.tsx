"use client";

import { createContext, useContext, ReactNode } from "react";
import { EventChecklistProgress } from "./types";

// event id -> checklist progress, provided once by the calendar board so chips
// and the hover card can show "3/8" without threading a prop through the grid.
const Ctx = createContext<Record<string, EventChecklistProgress>>({});

export function EventChecklistProvider({
  progress,
  children,
}: {
  progress: Record<string, EventChecklistProgress>;
  children: ReactNode;
}) {
  return <Ctx.Provider value={progress}>{children}</Ctx.Provider>;
}

export function useEventChecklistProgress(eventId: string): EventChecklistProgress | null {
  return useContext(Ctx)[eventId] ?? null;
}
