import { describe, expect, it } from "vitest";
import { planRestore } from "../undo/order";
import type { AffectedRow } from "../undo/types";

const row = (table: AffectedRow["table"], id: string, before: AffectedRow["before"], after: AffectedRow["after"]): AffectedRow => ({ table, id, before, after });

describe("planRestore", () => {
  it("undoing a deleted event re-creates the event before its checklist items", () => {
    const affected = [
      row("event_checklist_items", "i1", { id: "i1", event_id: "e1", done: true }, null),
      row("events", "e1", { id: "e1" }, null),
      row("event_checklist_items", "i2", { id: "i2", event_id: "e1", done: false }, null),
    ];
    const ops = planRestore(affected, "before");
    expect(ops.map((o) => o.id)).toEqual(["e1", "i1", "i2"]);
    expect(ops.every((o) => o.row !== null)).toBe(true);
  });

  it("restores checklist item state (done flag) from the before image", () => {
    const ops = planRestore([row("event_checklist_items", "i1", { id: "i1", done: false }, { id: "i1", done: true })], "before");
    expect(ops).toEqual([{ table: "event_checklist_items", id: "i1", row: { id: "i1", done: false } }]);
    expect(planRestore([row("event_checklist_items", "i1", { id: "i1", done: false }, { id: "i1", done: true })], "after")[0].row).toEqual({ id: "i1", done: true });
  });

  it("redoing a delete removes children before the parent, after any writes", () => {
    const affected = [
      row("events", "e1", { id: "e1" }, null),
      row("event_checklist_items", "i1", { id: "i1" }, null),
      row("levels", "l1", null, { id: "l1" }),
    ];
    const ops = planRestore(affected, "after");
    expect(ops.map((o) => `${o.table}:${o.row === null ? "del" : "put"}`)).toEqual([
      "levels:put",
      "event_checklist_items:del",
      "events:del",
    ]);
  });

  it("writes a top-level note before its replies, and deletes replies first", () => {
    const parent = row("note_comments", "p", { id: "p", parent_id: null }, null);
    const reply = row("note_comments", "r", { id: "r", parent_id: "p" }, null);
    expect(planRestore([reply, parent], "before").map((o) => o.id)).toEqual(["p", "r"]);
    expect(planRestore([parent, reply], "after").map((o) => o.id)).toEqual(["r", "p"]);
  });

  it("undoing a create deletes the row", () => {
    expect(planRestore([row("holidays", "h", null, { id: "h" })], "before")).toEqual([{ table: "holidays", id: "h", row: null }]);
  });
});
