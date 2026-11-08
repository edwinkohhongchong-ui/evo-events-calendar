import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent, makeOcc } from "./fixtures";
import { baseOccurrence, deleteHideKey, deleteScopeOccurrence, withoutDeleted } from "../eventDelete";

describe("delete scope", () => {
  it("offers no scope choice for a one-off event", () => {
    const ev = makeEvent({ event_date: "2026-03-01" });
    expect(deleteScopeOccurrence(ev, makeOcc(ev, "2026-03-01"))).toBeUndefined();
    expect(deleteScopeOccurrence(ev)).toBeUndefined();
  });

  it("uses the clicked occurrence of a recurring event", () => {
    const ev = makeEvent({ event_date: "2026-03-01", recurring: "Weekly" });
    const occ = makeOcc(ev, "2026-03-15");
    expect(deleteScopeOccurrence(ev, occ)).toBe(occ);
  });

  it("falls back to the series' first date when no occurrence is known", () => {
    const ev = makeEvent({ event_date: "2026-03-01", end_date: "2026-03-02", recurring: "Monthly" });
    const occ = deleteScopeOccurrence(ev);
    expect(occ?.originalDate).toBe("2026-03-01");
    expect(occ?.spanEndDate).toBe("2026-03-02");
    expect(baseOccurrence(ev)).toEqual(occ);
  });
});

describe("optimistic hiding", () => {
  const ev = makeEvent({ id: "a", event_date: "2026-03-01", recurring: "Weekly" });
  const other = makeEvent({ id: "b", event_date: "2026-03-01" });
  const occs = [makeOcc(ev, "2026-03-01"), makeOcc(ev, "2026-03-08"), makeOcc(other, "2026-03-01")];

  it("hides one occurrence", () => {
    const hidden = new Set([deleteHideKey({ scope: "occurrence", event: ev, originalDate: "2026-03-08" })]);
    expect(withoutDeleted(occs, hidden).map((o) => o.occurrenceDate + o.event.id)).toEqual(["2026-03-01a", "2026-03-01b"]);
  });

  it("hides every occurrence of a deleted series, and only that one", () => {
    const hidden = new Set([deleteHideKey({ scope: "series", event: ev })]);
    expect(withoutDeleted(occs, hidden).map((o) => o.event.id)).toEqual(["b"]);
  });

  it("returns the same array when nothing is hidden", () => {
    expect(withoutDeleted(occs, new Set())).toBe(occs);
  });
});

// Fake query builder that counts concurrently running queries, to prove the
// independent reads in the delete actions are issued together.
const state = vi.hoisted(() => ({
  running: 0,
  maxRunning: 0,
  calls: [] as string[],
  rows: {} as Record<string, unknown[]>,
  deleteRows: [{ id: "a" }] as unknown[],
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      let op = "select";
      const filters: Record<string, unknown> = {};
      const run = async () => {
        state.running++;
        state.maxRunning = Math.max(state.maxRunning, state.running);
        state.calls.push(`${op}:${table}`);
        await new Promise((r) => setTimeout(r, 1));
        state.running--;
        const data = op === "delete" && table === "events" ? state.deleteRows : state.rows[table] ?? [];
        return { data, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        delete: () => ((op = "delete"), b),
        upsert: () => ((op = "upsert"), b),
        eq: (c: string, v: unknown) => ((filters[c] = v), b),
        maybeSingle: async () => {
          const { data, error } = await run();
          return { data: (data as unknown[])[0] ?? null, error };
        },
        single: async () => {
          const { error } = await run();
          return { data: { id: "ex1", event_id: "a", original_date: "2026-03-08" }, error };
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
      };
      return b;
    },
  },
}));
vi.mock("../authz", () => ({ requireRole: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../activity", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../undo/capture", () => ({
  fetchRow: async () => {
    state.running++;
    state.maxRunning = Math.max(state.maxRunning, state.running);
    state.calls.push("select:events");
    await new Promise((r) => setTimeout(r, 1));
    state.running--;
    return { id: "a", name: "Camp", event_date: "2026-03-01", updated_at: "t1" };
  },
}));

import { deleteEvent, deleteOccurrence } from "../actions";
import { EVENT_CONFLICT_MESSAGE } from "../eventConflict";

beforeEach(() => {
  state.running = 0;
  state.maxRunning = 0;
  state.calls = [];
  state.deleteRows = [{ id: "a" }];
  state.rows = {
    event_overrides: [{ id: "o1", event_id: "a", original_date: "2026-03-08" }],
    event_exceptions: [{ id: "x1", event_id: "a", original_date: "2026-03-15" }],
    event_checklist_items: [{ id: "c1", event_id: "a" }],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("deleteEvent round trips", () => {
  it("captures the event and its three child tables concurrently, then deletes", async () => {
    const res = await deleteEvent("a", "t1");
    expect(res.ok).toBe(true);
    expect(state.maxRunning).toBe(4);
    expect(state.calls.slice(0, 4).sort()).toEqual(
      ["select:event_checklist_items", "select:event_exceptions", "select:event_overrides", "select:events"].sort()
    );
    expect(state.calls[4]).toBe("delete:events");
    if (res.ok) expect(res.data.map((r) => r.table).sort()).toEqual(
      ["event_checklist_items", "event_exceptions", "event_overrides", "events"]
    );
  });

  it("still fails with the conflict message when the guarded delete matches nothing", async () => {
    state.deleteRows = [];
    const res = await deleteEvent("a", "stale");
    expect(res).toEqual({ ok: false, error: EVENT_CONFLICT_MESSAGE });
  });
});

describe("deleteOccurrence round trips", () => {
  it("reads the exception and override together, then excepts and removes the override", async () => {
    const ev = makeEvent({ id: "a", event_date: "2026-03-01", recurring: "Weekly" });
    const res = await deleteOccurrence(ev, "2026-03-08");
    expect(res.ok).toBe(true);
    expect(state.maxRunning).toBe(2);
    expect(state.calls.slice(0, 2).sort()).toEqual(["select:event_exceptions", "select:event_overrides"]);
    expect(state.calls.slice(2)).toEqual(["upsert:event_exceptions", "delete:event_overrides"]);
  });
});
