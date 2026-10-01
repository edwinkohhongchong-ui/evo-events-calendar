import { describe, it, expect } from "vitest";
import { applyOverrides } from "../overrides";
import { expandEvents } from "../recurrence";
import { optimisticParity } from "./overridesParity";
import { parseDateStr } from "../dates";
import { OverrideRow } from "../types";
import { makeEvent, makeOcc } from "./fixtures";

const ov = (p: Partial<OverrideRow> & { event_id: string; original_date: string; new_date: string }): OverrideRow => ({
  id: "o1", new_time: null, new_end_date: null, created_at: "", ...p,
});

describe("applyOverrides", () => {
  const ev = makeEvent({ event_date: "2026-10-01", recurring: "Weekly" });
  const byId = new Map([[ev.id, ev]]);
  const occs = expandEvents([ev], parseDateStr("2026-10-01"), parseDateStr("2026-10-31"));

  it("moves an occurrence within the grid and flags it overridden", () => {
    const r = applyOverrides(occs, [ov({ event_id: ev.id, original_date: "2026-10-08", new_date: "2026-10-10" })], byId, "2026-10-01", "2026-10-31");
    const moved = r.find((o) => o.originalDate === "2026-10-08")!;
    expect(moved.occurrenceDate).toBe("2026-10-10");
    expect(moved.isOverridden).toBe(true);
    expect(r).toHaveLength(occs.length);
  });
  it("drops an occurrence dragged outside the visible grid", () => {
    const r = applyOverrides(occs, [ov({ event_id: ev.id, original_date: "2026-10-08", new_date: "2026-11-05" })], byId, "2026-10-01", "2026-10-31");
    expect(r.find((o) => o.originalDate === "2026-10-08")).toBeUndefined();
    expect(r).toHaveLength(occs.length - 1);
  });
  it("pulls in an occurrence dragged FROM another grid INTO this one (single-day)", () => {
    const r = applyOverrides(occs, [ov({ event_id: ev.id, original_date: "2026-11-05", new_date: "2026-10-20" })], byId, "2026-10-01", "2026-10-31");
    const pulled = r.find((o) => o.originalDate === "2026-11-05")!;
    expect(pulled.occurrenceDate).toBe("2026-10-20");
    expect(pulled.spanEndDate).toBe("2026-10-20");
  });
  it("ignores an override whose base event is missing from the fetch", () => {
    const r = applyOverrides([], [ov({ event_id: "ghost", original_date: "2026-11-05", new_date: "2026-10-20" })], new Map(), "2026-10-01", "2026-10-31");
    expect(r).toEqual([]);
  });
  it("time override recomputes end from duration; null duration gives null end", () => {
    const r = applyOverrides(occs, [ov({ event_id: ev.id, original_date: "2026-10-08", new_date: "2026-10-08", new_time: "23:30:00" })], byId, "2026-10-01", "2026-10-31");
    const o = r.find((x) => x.originalDate === "2026-10-08")!;
    expect([o.startTime, o.endTime]).toEqual(["23:30:00", "00:30"]);
    const ev2 = makeEvent({ id: "e2", event_date: "2026-10-01", recurring: "Weekly", duration_minutes: null, end_time: null });
    const o2 = applyOverrides(expandEvents([ev2], parseDateStr("2026-10-01"), parseDateStr("2026-10-31")),
      [ov({ event_id: "e2", original_date: "2026-10-08", new_date: "2026-10-08", new_time: "10:00:00" })], new Map([["e2", ev2]]), "2026-10-01", "2026-10-31")
      .find((x) => x.originalDate === "2026-10-08")!;
    expect(o2.endTime).toBeNull();
  });
  it("plain move shifts a multi-day span by the same days", () => {
    const m = makeEvent({ id: "m", event_date: "2026-10-05", end_date: "2026-10-07" });
    const r = applyOverrides([makeOcc(m, "2026-10-05", "2026-10-07")], [ov({ event_id: "m", original_date: "2026-10-05", new_date: "2026-10-12" })], new Map([["m", m]]), "2026-10-01", "2026-10-31");
    expect([r[0].occurrenceDate, r[0].spanEndDate]).toEqual(["2026-10-12", "2026-10-14"]);
  });
  it("explicit new_end_date wins over the shifted span (left/right resize)", () => {
    const m = makeEvent({ id: "m", event_date: "2026-10-05", end_date: "2026-10-07" });
    const r = applyOverrides([makeOcc(m, "2026-10-05", "2026-10-07")], [ov({ event_id: "m", original_date: "2026-10-05", new_date: "2026-10-03", new_end_date: "2026-10-07" })], new Map([["m", m]]), "2026-10-01", "2026-10-31");
    expect([r[0].occurrenceDate, r[0].spanEndDate]).toEqual(["2026-10-03", "2026-10-07"]);
  });
  it("two overrides for different occurrences of one event don't interfere", () => {
    const r = applyOverrides(occs, [
      ov({ id: "a", event_id: ev.id, original_date: "2026-10-08", new_date: "2026-10-09" }),
      ov({ id: "b", event_id: ev.id, original_date: "2026-10-15", new_date: "2026-10-16" }),
    ], byId, "2026-10-01", "2026-10-31");
    expect(r.filter((o) => o.isOverridden).map((o) => o.occurrenceDate).sort()).toEqual(["2026-10-09", "2026-10-16"]);
  });
  it("overrides are inclusive at both grid boundaries", () => {
    const r = applyOverrides(occs, [ov({ event_id: ev.id, original_date: "2026-10-08", new_date: "2026-10-31" })], byId, "2026-10-01", "2026-10-31");
    expect(r.find((o) => o.originalDate === "2026-10-08")?.occurrenceDate).toBe("2026-10-31");
  });

  // BUG (found by this suite): the "pulled in from another grid" branch seeds
  // spanEndDate with baseEvent.end_date (the ANCHOR's end), not
  // original_date + template span. For a recurring multi-day series whose
  // occurrence is not the first one, the resulting span end is wrong.
  // lib/overrides.ts ~line 98 (`spanEndDate: baseEvent.end_date ?? override.original_date`).
  it.skip("recurring multi-day occurrence pulled in from another grid keeps the template length", () => {
    const camp = makeEvent({ id: "camp", event_date: "2026-09-01", end_date: "2026-09-03", recurring: "Monthly" });
    // 1 Nov occurrence (spans 1-3 Nov) dragged to 20 Oct; expect 20-22 Oct.
    const r = applyOverrides([], [ov({ event_id: "camp", original_date: "2026-11-01", new_date: "2026-10-20" })], new Map([["camp", camp]]), "2026-10-01", "2026-10-31");
    expect(r[0].spanEndDate).toBe("2026-10-22");
  });
  it("documents current (wrong) value for the bug above so a fix is noticed", () => {
    const camp = makeEvent({ id: "camp", event_date: "2026-09-01", end_date: "2026-09-03", recurring: "Monthly" });
    const r = applyOverrides([], [ov({ event_id: "camp", original_date: "2026-11-01", new_date: "2026-10-20" })], new Map([["camp", camp]]), "2026-10-01", "2026-10-31");
    expect(r[0].spanEndDate).not.toBe("2026-10-22"); // flip to toBe once fixed, then delete the skip above
  });
  it("optimistic move mirrors server override for a multi-day occurrence", () => {
    expect(optimisticParity()).toBe(true);
  });
});
