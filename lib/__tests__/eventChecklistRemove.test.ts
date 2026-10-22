import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
const logActivity = vi.fn();
const deleted: string[] = [];
let items: { id: string; event_id: string; item: string; done: boolean }[];

// Tiny query-builder fake: select/eq/maybeSingle/single/delete on 3 tables.
vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      const filters: [string, string][] = [];
      let isDelete = false;
      const rowsNow = () => {
        if (table === "events") return [{ name: "Camp", event_date: "2026-03-01" }];
        return items.filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
      };
      const b: Record<string, unknown> = {
        select: () => b,
        delete: () => ((isDelete = true), b),
        eq: (c: string, v: string) => {
          filters.push([c, v]);
          return b;
        },
        maybeSingle: async () => ({ data: rowsNow()[0] ?? null, error: null }),
        single: async () => ({ data: rowsNow()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (isDelete) {
            const gone = rowsNow() as { id: string }[];
            deleted.push(...gone.map((g) => g.id));
            items = items.filter((r) => !gone.includes(r));
            return Promise.resolve({ data: null, error: null }).then(res);
          }
          return Promise.resolve({ data: rowsNow(), error: null }).then(res);
        },
      };
      return b;
    },
  },
}));
vi.mock("../authz", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("../activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

import { removeChecklistItem, removeEventChecklist } from "../eventChecklistActions";

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(undefined);
  logActivity.mockReset();
  deleted.length = 0;
  items = [
    { id: "i1", event_id: "e1", item: "Book hall", done: true },
    { id: "i2", event_id: "e1", item: "Print", done: false },
    { id: "i3", event_id: "e2", item: "Other event", done: false },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("checklist deletes are undoable and logged", () => {
  it("removeChecklistItem returns the full removed row and logs it", async () => {
    const res = await removeChecklistItem("i1");
    expect(requireRole).toHaveBeenCalledWith("editor");
    expect(res).toEqual({
      ok: true,
      data: [{ table: "event_checklist_items", id: "i1", before: { id: "i1", event_id: "e1", item: "Book hall", done: true }, after: null }],
    });
    expect(deleted).toEqual(["i1"]);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ entity: "event", entityId: "e1", label: "Camp (checklist)" }));
  });

  it("removeChecklistItem on a missing item fails without deleting or logging", async () => {
    const res = await removeChecklistItem("nope");
    expect(res.ok).toBe(false);
    expect(deleted).toEqual([]);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("removeEventChecklist returns one affected row per removed item, only for that event", async () => {
    const res = await removeEventChecklist("e1");
    expect(res.ok && res.data.map((a) => [a.id, a.after, a.before?.item])).toEqual([
      ["i1", null, "Book hall"],
      ["i2", null, "Print"],
    ]);
    expect(deleted).toEqual(["i1", "i2"]);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ label: "Camp (checklist removed)" }));
  });

  it("both refuse before touching anything when the Editor check fails", async () => {
    requireRole.mockRejectedValue(new Error("You need Edit access to do this."));
    const results = await Promise.all([removeChecklistItem("i1"), removeEventChecklist("e1")]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(deleted).toEqual([]);
  });
});
