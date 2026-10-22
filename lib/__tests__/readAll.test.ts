import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../supabase", () => ({ supabase: {} }));
import { readAll, READ_PAGE } from "../readAll";

type Result = { data: unknown[] | null; error: { message?: string } | null };

// Fake client serving `pages` in order and recording each requested range.
function fakeClient(pages: Result[]) {
  const ranges: [number, number][] = [];
  let i = 0;
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            return pages[i++] ?? { data: [], error: null };
          },
        }),
      }),
    }),
  };
  return { client, ranges };
}
const rows = (n: number) => Array.from({ length: n }, (_, k) => ({ id: String(k) }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("readAll", () => {
  it("returns a short first page without asking for another", async () => {
    const { client, ranges } = fakeClient([{ data: rows(3), error: null }]);
    expect(await readAll("events", "*", client)).toHaveLength(3);
    expect(ranges).toEqual([[0, READ_PAGE - 1]]);
  });

  it("keeps paging while pages are full and stitches them together", async () => {
    const { client, ranges } = fakeClient([
      { data: rows(READ_PAGE), error: null },
      { data: rows(READ_PAGE), error: null },
      { data: rows(5), error: null },
    ]);
    expect(await readAll("events", "*", client)).toHaveLength(READ_PAGE * 2 + 5);
    expect(ranges).toEqual([
      [0, READ_PAGE - 1],
      [READ_PAGE, READ_PAGE * 2 - 1],
      [READ_PAGE * 2, READ_PAGE * 3 - 1],
    ]);
  });

  it("treats a null data page as empty", async () => {
    const { client } = fakeClient([{ data: null, error: null }]);
    expect(await readAll("events", "*", client)).toEqual([]);
  });

  it("throws a generic error, logging the driver detail only server-side, on any failed page", async () => {
    const { client } = fakeClient([
      { data: rows(READ_PAGE), error: null },
      { data: null, error: { message: "secret driver detail" } },
    ]);
    const err = await readAll("events", "*", client).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Could not read the calendar. Please try again.");
    expect((err as Error).message).not.toContain("secret");
    expect(console.error).toHaveBeenCalledWith("reading events failed:", "secret driver detail");
  });
});
