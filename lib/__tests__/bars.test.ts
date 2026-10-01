import { describe, it, expect } from "vitest";
import { eachDayOfInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { assignEventLanes, computeEventBarSegments } from "../eventBars";
import { assignSeasonLanes, computeSeasonSegments } from "../seasonBars";
import { buildDayIndex } from "../dayIndex";
import { toDateStr } from "../dates";
import { SeasonRow } from "../types";
import { makeEvent, makeOcc } from "./fixtures";

function grid(y: number, m: number) {
  const ms = startOfMonth(new Date(y, m - 1, 1));
  const gs = startOfWeek(ms, { weekStartsOn: 1 });
  const ge = endOfWeek(endOfMonth(ms), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gs, end: ge });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { ms, gs, ge, days, weeks };
}
const season = (id: string, s: string, e: string): SeasonRow => ({ id, name: id, category: "Growth Cycles" as never, start_date: s, end_date: e, notes: null, color: null });

describe("event bars", () => {
  const g = grid(2026, 10); // Mon 28 Sep - Sun 1 Nov
  it("grid is Monday-start 6 columns of 7", () => {
    expect(toDateStr(g.gs)).toBe("2026-09-28");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("ignores single-day occurrences", () => {
    const e = makeEvent({ event_date: "2026-10-05" });
    expect(computeEventBarSegments([makeOcc(e, "2026-10-05")], g.weeks, g.gs, g.ge).flat()).toEqual([]);
  });
  it("splits a bar crossing a week boundary, flagging start/end correctly", () => {
    const e = makeEvent({ event_date: "2026-10-03", end_date: "2026-10-06" });
    const segs = computeEventBarSegments([makeOcc(e, "2026-10-03", "2026-10-06")], g.weeks, g.gs, g.ge);
    const flat = segs.flat();
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ startCol: 5, endCol: 6, isSpanStart: true, isSpanEnd: false });
    expect(flat[1]).toMatchObject({ startCol: 0, endCol: 1, isSpanStart: false, isSpanEnd: true });
    expect(flat[0].laneIndex).toBe(flat[1].laneIndex);
  });
  it("a bar starting before the grid is clipped and not marked as start (spans month boundary)", () => {
    const e = makeEvent({ event_date: "2026-09-20", end_date: "2026-09-30" });
    const flat = computeEventBarSegments([makeOcc(e, "2026-09-20", "2026-09-30")], g.weeks, g.gs, g.ge).flat();
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ weekIndex: 0, startCol: 0, endCol: 2, isSpanStart: false, isSpanEnd: true });
  });
  it("a bar entirely outside the grid yields nothing; one ending on gridStart yields one cell", () => {
    const out = makeEvent({ event_date: "2026-09-01", end_date: "2026-09-27" });
    const touch = makeEvent({ id: "t", event_date: "2026-09-25", end_date: "2026-09-28" });
    const flat = computeEventBarSegments([makeOcc(out, "2026-09-01", "2026-09-27"), makeOcc(touch, "2026-09-25", "2026-09-28")], g.weeks, g.gs, g.ge).flat();
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ startCol: 0, endCol: 0, isSpanEnd: true });
  });
  it("overlapping bars get different lanes; disjoint bars reuse lane 0", () => {
    const a = makeEvent({ id: "a", event_date: "2026-10-05", end_date: "2026-10-08" });
    const b = makeEvent({ id: "b", event_date: "2026-10-07", end_date: "2026-10-09" });
    const c = makeEvent({ id: "c", event_date: "2026-10-12", end_date: "2026-10-13" });
    const lanes = assignEventLanes([makeOcc(a, "2026-10-05", "2026-10-08"), makeOcc(b, "2026-10-07", "2026-10-09"), makeOcc(c, "2026-10-12", "2026-10-13")], g.gs, g.ge);
    expect(Array.from(lanes.values()).sort()).toEqual([0, 0, 1]);
    expect(lanes.get("a::2026-10-05")).toBe(0);
    expect(lanes.get("b::2026-10-07")).toBe(1);
    expect(lanes.get("c::2026-10-12")).toBe(0);
  });
  it("same-day touching bars (end == next start) do not share a lane", () => {
    const a = makeEvent({ id: "a", event_date: "2026-10-05", end_date: "2026-10-07" });
    const b = makeEvent({ id: "b", event_date: "2026-10-07", end_date: "2026-10-08" });
    const lanes = assignEventLanes([makeOcc(a, "2026-10-05", "2026-10-07"), makeOcc(b, "2026-10-07", "2026-10-08")], g.gs, g.ge);
    expect(lanes.get("a::2026-10-05")).not.toBe(lanes.get("b::2026-10-07"));
  });
  it("lane keys use originalDate so a dragged occurrence keeps identity", () => {
    const e = makeEvent({ event_date: "2026-10-05", end_date: "2026-10-06" });
    const o = { ...makeOcc(e, "2026-10-12", "2026-10-13"), originalDate: "2026-10-05" };
    expect(Array.from(assignEventLanes([o], g.gs, g.ge).keys())).toEqual(["evt-1::2026-10-05"]);
  });
});

describe("season bars", () => {
  const g = grid(2026, 10);
  it("season spanning the whole grid: start/end flags only where real", () => {
    const segs = computeSeasonSegments([season("s", "2026-09-01", "2026-12-31")], g.weeks, g.gs, g.ge);
    const flat = segs.flat();
    expect(flat).toHaveLength(g.weeks.length);
    expect(flat.some((s) => s.isSeasonStart || s.isSeasonEnd)).toBe(false);
  });
  it("single-day season, and season on the last grid day", () => {
    const flat = computeSeasonSegments([season("a", "2026-10-10", "2026-10-10"), season("b", "2026-11-01", "2026-11-30")], g.weeks, g.gs, g.ge).flat();
    expect(flat.find((s) => s.season.id === "a")).toMatchObject({ startCol: 5, endCol: 5, isSeasonStart: true, isSeasonEnd: true });
    expect(flat.find((s) => s.season.id === "b")).toMatchObject({ startCol: 6, endCol: 6, isSeasonStart: true, isSeasonEnd: false });
  });
  it("reuses a freed lane and stays deterministic", () => {
    const l = assignSeasonLanes([season("a", "2026-10-01", "2026-10-05"), season("b", "2026-10-03", "2026-10-08"), season("c", "2026-10-10", "2026-10-12")], g.gs, g.ge);
    expect([l.get("a"), l.get("b"), l.get("c")]).toEqual([0, 1, 0]);
  });
  it("season fully outside the grid is skipped", () => {
    expect(computeSeasonSegments([season("x", "2025-01-01", "2025-02-01")], g.weeks, g.gs, g.ge).flat()).toEqual([]);
  });
});

describe("buildDayIndex", () => {
  const g = grid(2026, 10);
  it("only puts single-day, in-month occurrences on days; overflow days stay clean", () => {
    const inM = makeEvent({ id: "in", event_date: "2026-10-05" });
    const over = makeEvent({ id: "ov", event_date: "2026-09-29" });
    const multi = makeEvent({ id: "mu", event_date: "2026-10-05", end_date: "2026-10-06" });
    const idx = buildDayIndex(g.days, [makeOcc(inM, "2026-10-05"), makeOcc(over, "2026-09-29"), makeOcc(multi, "2026-10-05", "2026-10-06")], [], g.ms);
    expect(idx.get("2026-10-05")!.occurrences.map((o) => o.event.id)).toEqual(["in"]);
    expect(idx.get("2026-09-29")!.occurrences).toEqual([]);
    expect(idx.size).toBe(g.days.length);
  });
  it("silently drops holidays/notes/occurrences outside the grid", () => {
    const idx = buildDayIndex(g.days, [], [{ id: "h", holiday_date: "2027-01-01" } as never], g.ms, [{ id: "n", note_date: "2030-01-01" } as never]);
    expect(Array.from(idx.values()).every((d) => d.holidays.length === 0 && d.dayNotes.length === 0)).toBe(true);
  });
  it("attaches holidays and notes to the right day", () => {
    const idx = buildDayIndex(g.days, [], [{ id: "h", holiday_date: "2026-10-10" } as never], g.ms, [{ id: "n", note_date: "2026-10-11" } as never]);
    expect(idx.get("2026-10-10")!.holidays).toHaveLength(1);
    expect(idx.get("2026-10-11")!.dayNotes).toHaveLength(1);
  });
});
