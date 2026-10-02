import { describe, expect, it } from "vitest";
import { EVENT_CONFLICT_MESSAGE, eventLockToken, isEventConflict, rememberEventToken } from "../eventConflict";
import { read, stripComments } from "./policySource";

describe("isEventConflict", () => {
  it("recognises the conflict message", () => {
    expect(isEventConflict(EVENT_CONFLICT_MESSAGE)).toBe(true);
  });
  it("ignores other errors and empty values", () => {
    expect(isEventConflict("Event not found.")).toBe(false);
    expect(isEventConflict("")).toBe(false);
    expect(isEventConflict(null)).toBe(false);
    expect(isEventConflict(undefined)).toBe(false);
  });
});

describe("event lock tokens for drags", () => {
  const event = { id: "e1", updated_at: "2026-01-01T00:00:00+00:00" };
  it("uses the event's own token when nothing fresher is known", () => {
    expect(eventLockToken(event, new Map())).toBe(event.updated_at);
    expect(eventLockToken({ id: "e1" }, new Map())).toBeUndefined();
  });
  it("prefers the token a previous write returned, so back-to-back drags don't self-conflict", () => {
    const fresh = new Map<string, string>();
    rememberEventToken(fresh, "e1", [
      { table: "events", id: "e1", after: { updated_at: "2026-01-02T00:00:00+00:00" } },
    ]);
    expect(eventLockToken(event, fresh)).toBe("2026-01-02T00:00:00+00:00");
    expect(eventLockToken({ id: "e2", updated_at: "x" }, fresh)).toBe("x");
  });
  it("ignores override-only writes and missing tokens", () => {
    const fresh = new Map<string, string>();
    expect(rememberEventToken(fresh, "e1", [{ table: "event_overrides", id: "o1", after: { updated_at: "z" } }])).toBeUndefined();
    expect(rememberEventToken(fresh, "e1", [{ table: "events", id: "e1", after: null }])).toBeUndefined();
    expect(fresh.size).toBe(0);
  });
});

describe("optimistic lock parameter on event actions", () => {
  const src = stripComments(read("lib/actions.ts"));
  const locked = [
    "moveOccurrence", "retimeOccurrence", "extendOccurrenceSpan", "moveOccurrenceStart",
    "deleteEvent", "detachOccurrence", "splitSeriesFromOccurrence", "updateEvent",
  ];
  for (const name of locked) {
    it(`${name}Impl takes an OPTIONAL expectedUpdatedAt`, () => {
      const m = src.match(new RegExp(`async function ${name}Impl\\(([^)]*)\\)`));
      expect(m).not.toBeNull();
      expect(m![1]).toMatch(/expectedUpdatedAt\?: string/);
    });
  }
  it("requireRole stays the first statement of the newly locked actions", () => {
    for (const name of locked) {
      const body = src.split(`async function ${name}Impl(`)[1].split("{")[1];
      expect(body.replace(/\s+/g, " ").trim().startsWith('await requireRole("editor")')).toBe(true);
    }
  });
});
