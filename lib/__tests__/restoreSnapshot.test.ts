import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const del = vi.fn();
vi.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: unknown) => upsert(table, row),
      delete: () => ({ eq: (_c: string, id: string) => del(table, id) }),
    }),
  },
}));
vi.mock("../authz", () => ({ requireRole: async () => undefined }));
vi.mock("../activity", () => ({ logActivity: async () => undefined }));

import { restoreSnapshot } from "../undo/restore";

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ error: null });
  del.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("restoreSnapshot validation", () => {
  it("writes valid rows", async () => {
    const res = await restoreSnapshot([{ table: "levels", id: "l1", before: { id: "l1", name: "n", color_key: "teal", sort_order: 0 }, after: null }], "before");
    expect(res.ok).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("writes nothing at all when any row is bad, even the valid ones", async () => {
    const res = await restoreSnapshot(
      [
        { table: "levels", id: "l1", before: { id: "l1", name: "n", color_key: "teal", sort_order: 0 }, after: null },
        { table: "events", id: "e1", before: { id: "e1", name: "x", injected_column: 1 }, after: null },
        { table: "events", id: "e2", before: null, after: { id: "e2" } },
      ],
      "before"
    );
    expect(res.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
