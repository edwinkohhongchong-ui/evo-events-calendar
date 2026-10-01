import type { EventRow } from "./types";

type Searchable = Pick<EventRow, "name" | "series" | "location" | "theme" | "preacher_name" | "sermon_title">;

/** Lower-cased, trimmed, whitespace-split search terms; empty when there is nothing to search for. */
export function parseSearchQuery(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Case-insensitive match on name, series, location, theme, preacher and
 * sermon title. Every whitespace-separated term must appear somewhere in
 * those fields (so "youth camp" matches name "Camp" + series "Youth").
 * An empty query matches everything.
 */
export function matchesEventQuery(event: Searchable, query: string): boolean {
  const terms = parseSearchQuery(query);
  if (terms.length === 0) return true;
  const haystack = [event.name, event.series, event.location, event.theme, event.preacher_name, event.sermon_title]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}
