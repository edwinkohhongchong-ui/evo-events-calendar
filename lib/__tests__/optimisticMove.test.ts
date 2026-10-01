import { describe, it, expect } from "vitest";
import { withOptimisticMove } from "../optimisticMove";
import { EventOccurrence } from "../types";

const occ = (occurrenceDate: string, spanEndDate: string) =>
  ({ occurrenceDate, spanEndDate, originalDate: occurrenceDate }) as unknown as EventOccurrence;

describe("withOptimisticMove", () => {
  it("keeps a single-day occurrence single-day when moved earlier", () => {
    const moved = withOptimisticMove(occ("2026-10-09", "2026-10-09"), "2026-10-07");
    expect(moved.occurrenceDate).toBe("2026-10-07");
    expect(moved.spanEndDate).toBe("2026-10-07");
  });
  it("preserves multi-day length", () => {
    const moved = withOptimisticMove(occ("2026-10-09", "2026-10-11"), "2026-10-14");
    expect(moved.spanEndDate).toBe("2026-10-16");
  });
});
