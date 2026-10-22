import { describe, expect, it } from "vitest";
import { assertRestorable } from "../undo/restoreRows";
import type { RestoreOp } from "../undo/order";

const op = (table: RestoreOp["table"], row: RestoreOp["row"], id = "r1"): RestoreOp => ({ table, id, row });
const MSG = "That change can't be undone or redone because its saved details look wrong.";

describe("assertRestorable", () => {
  it("accepts full database snapshots, including system columns", () => {
    expect(() =>
      assertRestorable([
        op("events", { id: "r1", name: "x", event_date: "2026-01-01", created_at: "t", updated_at: "t", owner: "Sam", is_major: false }),
        op("event_checklist_items", { id: "r1", event_id: "e", item: "i", done: false, owner: null, created_at: "t" }),
        op("levels", { id: "r1", name: "n", color_key: "#AABBCC", sort_order: 1 }),
        op("seasons", { id: "r1", name: "n", color: null }),
        op("day_notes", { id: "r1", note_date: "2026-01-01", content: "c", details: null, updated_at: "t" }),
        op("note_comments", { id: "r1", scope: "general", parent_id: null }),
        op("events", null),
      ])
    ).not.toThrow();
  });

  it("rejects unknown columns", () => {
    expect(() => assertRestorable([op("events", { id: "r1", name: "x", is_admin: true })])).toThrow(MSG);
  });

  it("rejects a column that belongs to a different table", () => {
    expect(() => assertRestorable([op("holidays", { id: "r1", notes: "x" })])).toThrow(MSG);
  });

  it("rejects bad colours on levels and seasons", () => {
    expect(() => assertRestorable([op("levels", { id: "r1", color_key: "red; background:url(x)" })])).toThrow(MSG);
    expect(() => assertRestorable([op("levels", { id: "r1", color_key: null })])).toThrow(MSG);
    expect(() => assertRestorable([op("seasons", { id: "r1", color: "#12345" })])).toThrow(MSG);
  });

  it("rejects an over-long or non-string owner", () => {
    expect(() => assertRestorable([op("events", { id: "r1", owner: "x".repeat(61) })])).toThrow(MSG);
    expect(() => assertRestorable([op("event_checklist_items", { id: "r1", owner: 5 })])).toThrow(MSG);
  });

  it("rejects an unknown table (also for deletes) and a mismatched id", () => {
    expect(() => assertRestorable([op("activity_log" as never, null)])).toThrow(MSG);
    expect(() => assertRestorable([op("toString" as never, null)])).toThrow(MSG);
    expect(() => assertRestorable([op("events", { id: "other" })])).toThrow(MSG);
    expect(() => assertRestorable([op("events", {})])).toThrow(MSG);
  });

  it("rejects the whole batch if any one row is bad", () => {
    expect(() => assertRestorable([op("events", { id: "r1" }), op("levels", { id: "r2", color_key: "nope" }, "r2")])).toThrow(MSG);
  });
});
