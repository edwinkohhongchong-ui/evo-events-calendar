import { describe, it, expect } from "vitest";
import { MAX_EXPORT_OCCURRENCES, exceedsExportOccurrenceCap } from "../exportLimits";

describe("exceedsExportOccurrenceCap", () => {
  it("allows up to and including the cap, rejects one over", () => {
    expect(exceedsExportOccurrenceCap(0)).toBe(false);
    expect(exceedsExportOccurrenceCap(MAX_EXPORT_OCCURRENCES)).toBe(false);
    expect(exceedsExportOccurrenceCap(MAX_EXPORT_OCCURRENCES + 1)).toBe(true);
  });
});
