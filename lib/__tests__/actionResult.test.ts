import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERIC_ACTION_ERROR, looksLikeDatabaseError, runAction } from "../actionResult";

describe("looksLikeDatabaseError", () => {
  it.each([
    'new row for relation "events" violates check constraint "events_level_check"',
    'duplicate key value violates unique constraint "levels_name_key"',
    'relation "public.foo" does not exist',
    'column "owner" of relation "events" does not exist',
    "PGRST204: Could not find the column",
    'syntax error at or near "select"',
    "permission denied for table events",
    "JWT expired",
    "code: 23505",
    'error="42P01"',
    "SQLSTATE 23503",
  ])("flags %s", (msg) => {
    expect(looksLikeDatabaseError(msg)).toBe(true);
  });

  it.each([
    "Pick a valid colour.",
    "Event not found.",
    "Someone else changed this since you loaded it — please refresh and try again.",
    "Something went wrong saving this event. Check your connection and try again. Your details are still in the form.",
    "Can't delete this category — it's still used by one or more events. Reassign those events first.",
    "Owner must be 60 characters or fewer.",
  ])("passes %s", (msg) => {
    expect(looksLikeDatabaseError(msg)).toBe(false);
  });

  it("does not flag any hand-written message literal in the action files", () => {
    const LIB = join(__dirname, "..");
    const files = readdirSync(LIB).filter((f) => f === "actions.ts" || /(Actions|authz|owner|eventConflict|colorStyle)\.ts$/.test(f));
    const literals: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(LIB, f), "utf8");
      for (const m of Array.from(src.matchAll(/new Error\(\s*(["`])((?:\\.|(?!\1).)*)\1/g))) literals.push(m[2]);
    }
    expect(literals.length).toBeGreaterThan(20);
    expect(literals.filter((l) => !l.includes("${") && looksLikeDatabaseError(l))).toEqual([]);
  });
});

describe("runAction", () => {
  it("passes a friendly Error message through unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runAction(async () => { throw new Error("Event not found."); })).toEqual({ ok: false, error: "Event not found." });
  });

  it("replaces a driver-like message and logs the original", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error('duplicate key value violates unique constraint "x"');
    expect(await runAction(async () => { throw err; })).toEqual({ ok: false, error: GENERIC_ACTION_ERROR });
    expect(spy).toHaveBeenCalledWith(err);
  });

  it("returns data on success", async () => {
    expect(await runAction(async () => 5)).toEqual({ ok: true, data: 5 });
  });
});
