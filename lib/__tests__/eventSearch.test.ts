import { describe, it, expect } from "vitest";
import { matchesEventQuery, parseSearchQuery } from "../eventSearch";
import { makeEvent } from "./fixtures";

const ev = makeEvent({
  event_date: "2026-05-03",
  name: "Sunday Gathering",
  series: "Fully Alive",
  location: "Main Hall",
  theme: "Hope",
  preacher_name: "Edwin Koh",
  sermon_title: "Rise Up",
});

describe("parseSearchQuery", () => {
  it("lower-cases, trims and splits on whitespace", () => {
    expect(parseSearchQuery("  Youth   CAMP ")).toEqual(["youth", "camp"]);
    expect(parseSearchQuery("   ")).toEqual([]);
  });
});

describe("matchesEventQuery", () => {
  it("empty or blank query matches everything", () => {
    expect(matchesEventQuery(ev, "")).toBe(true);
    expect(matchesEventQuery(ev, "   ")).toBe(true);
  });
  it.each([
    ["name", "sunday"],
    ["series", "FULLY"],
    ["location", "main hall"],
    ["theme", "hope"],
    ["preacher", "koh"],
    ["sermon title", "rise up"],
  ])("matches on %s, case-insensitively", (_f, q) => {
    expect(matchesEventQuery(ev, q)).toBe(true);
  });
  it("does not match unrelated text or non-searched fields", () => {
    expect(matchesEventQuery(ev, "zzz")).toBe(false);
    expect(matchesEventQuery(makeEvent({ event_date: "2026-05-03", notes: "bring snacks" }), "snacks")).toBe(false);
  });
  it("all terms must match, across different fields", () => {
    expect(matchesEventQuery(ev, "sunday hope")).toBe(true);
    expect(matchesEventQuery(ev, "sunday camp")).toBe(false);
  });
  it("handles null fields", () => {
    expect(matchesEventQuery(makeEvent({ event_date: "2026-05-03", name: "Retreat" }), "retreat")).toBe(true);
    expect(matchesEventQuery(makeEvent({ event_date: "2026-05-03", name: "Retreat" }), "null")).toBe(false);
  });
});
