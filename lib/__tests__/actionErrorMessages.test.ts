import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LIB = join(__dirname, "..");

// User-facing messages must be hand-written. A Supabase/driver `error.message`
// can carry table/column names or SQL detail, and runAction() returns thrown
// messages to the browser verbatim, so never pass one into `new Error(...)`.
// Log the detail with console.error and throw a friendly sentence instead.
describe("server action error messages", () => {
  const files = readdirSync(LIB).filter(
    (f) => (f === "actions.ts" || /Actions\.ts$/.test(f)) && !/ 2\.ts$/.test(f)
  );

  it("scans the action files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s never builds an Error from a raw .message", (file) => {
    const src = readFileSync(join(LIB, file), "utf8");
    // Statement-bounded so multi-line template literals are covered.
    const offenders = src.match(/new Error\([^;]*\.message/g) ?? [];
    expect(offenders).toEqual([]);
  });
});
