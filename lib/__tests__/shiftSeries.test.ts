import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Supabase that logs every write so the order and rollback are visible.
const state = vi.hoisted(() => ({
  log: [] as string[],
  eventRows: [] as unknown[], // rows the guarded events update returns
  failChildUpdate: false,
  overrides: [] as unknown[],
  exceptions: [] as unknown[],
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      let op = "select";
      let patch: unknown;
      let id: unknown;
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: unknown) => ((op = "update"), (patch = p), b),
        upsert: (p: unknown) => ((op = "upsert"), (patch = p), b),
        eq: (c: string, v: unknown) => {
          if (c === "id") id = v;
          if (c === "updated_at") state.log.push(`guard:${v}`);
          return b;
        },
        single: async () => {
          state.log.push(`update:${table}:${id}:${JSON.stringify(patch)}`);
          if (table !== "events" && state.failChildUpdate) return { data: null, error: { message: "boom" } };
          return { data: { id, ...(patch as object) }, error: null };
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve().then(() => {
            if (op === "upsert") {
              state.log.push(`rollback:${table}:${(patch as { id: string }).id}`);
              return { data: null, error: null };
            }
            if (op === "update" && table === "events") {
              state.log.push(`update:events:${id}:${JSON.stringify(patch)}`);
              return { data: state.eventRows, error: null };
            }
            const data = table === "event_overrides" ? state.overrides : table === "event_exceptions" ? state.exceptions : [];
            return { data, error: null };
          }).then(res, rej),
      };
      return b;
    },
  },
}));
const requireRole = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../authz", () => ({ requireRole }));
vi.mock("../activity", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const eventRow = {
  id: "a", name: "Cell group", event_date: "2026-03-02", end_date: null, repeat_until: "2026-06-01",
  recurring: "Weekly", updated_at: "t1",
};
vi.mock("../undo/capture", () => ({ fetchRow: async () => eventRow }));

import { shiftSeries } from "../actions";
import { EVENT_CONFLICT_MESSAGE } from "../eventConflict";

beforeEach(() => {
  state.log = [];
  state.eventRows = [{ ...eventRow, event_date: "2026-03-04", repeat_until: "2026-06-03", updated_at: "t2" }];
  state.failChildUpdate = false;
  state.overrides = [];
  state.exceptions = [{ id: "x1", event_id: "a", original_date: "2026-03-16" }];
  requireRole.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("shiftSeries", () => {
  it("checks the Editor role first", async () => {
    await shiftSeries("a", 2, "t1");
    expect(requireRole).toHaveBeenCalledWith("editor");
  });

  it("moves the event under the lock, then its exceptions, and returns every row for Undo", async () => {
    const res = await shiftSeries("a", 2, "t1");
    expect(res.ok).toBe(true);
    expect(state.log[0]).toBe("guard:t1");
    expect(state.log[1]).toBe('update:events:a:{"event_date":"2026-03-04","end_date":null,"repeat_until":"2026-06-03"}');
    expect(state.log[2]).toBe('update:event_exceptions:x1:{"original_date":"2026-03-18"}');
    if (res.ok) expect(res.data.map((r) => r.table)).toEqual(["events", "event_exceptions"]);
  });

  it("reports the conflict message and writes nothing else when the lock misses", async () => {
    state.eventRows = [];
    const res = await shiftSeries("a", 2, "stale");
    expect(res).toEqual({ ok: false, error: EVENT_CONFLICT_MESSAGE });
    expect(state.log.some((l) => l.startsWith("update:event_exceptions"))).toBe(false);
  });

  it("restores the event row when a child update fails", async () => {
    state.failChildUpdate = true;
    const res = await shiftSeries("a", 2, "t1");
    expect(res.ok).toBe(false);
    expect(state.log).toContain("rollback:events:a");
  });

  it("refuses a colliding shift before writing anything", async () => {
    state.exceptions = [
      { id: "x1", event_id: "a", original_date: "2026-03-09" },
      { id: "x2", event_id: "a", original_date: "2026-03-16" },
    ];
    const res = await shiftSeries("a", 7, "t1");
    expect(res.ok).toBe(false);
    expect(state.log.filter((l) => l.startsWith("update"))).toEqual([]);
  });
});
