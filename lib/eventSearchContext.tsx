"use client";

import { createContext, useContext } from "react";

// Search state lives in CalendarBoard (which owns the occurrences); header,
// chips, bars and the phone agenda just read it. The default value means
// "no search active", so components outside the board render normally.
export interface EventSearchValue {
  query: string;
  setQuery: (q: string) => void;
  /** True when the query has at least one term. */
  active: boolean;
  /** Event ids matching the query; only meaningful while `active`. */
  matchedIds: Set<string>;
  /** Occurrences touching the visible month that match. */
  matchCount: number;
}

const EMPTY: EventSearchValue = {
  query: "",
  setQuery: () => {},
  active: false,
  matchedIds: new Set(),
  matchCount: 0,
};

export const EventSearchContext = createContext<EventSearchValue>(EMPTY);

export function useEventSearch() {
  return useContext(EventSearchContext);
}

/** True when a search is active and this event does not match it. */
export function useIsDimmed(eventId: string) {
  const { active, matchedIds } = useContext(EventSearchContext);
  return active && !matchedIds.has(eventId);
}
