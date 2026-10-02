import { describe, it, expect } from "vitest";
import {
  buildQuickAddValues,
  defaultQuickLevel,
  displayCategoryFor,
  eventTypeButtonNames,
  placePopover,
  validateQuickAdd,
} from "../quickAdd";

const names = (...n: string[]) => n.map((name) => ({ name }));

describe("eventTypeButtonNames", () => {
  it("Churchwide first, Zone right after, Gathering excluded, exact names", () => {
    expect(eventTypeButtonNames(names("COW", "Youth", "Churchwide", "Gathering", "Thirdspace", "Poly"))).toEqual([
      "Churchwide",
      "Zone",
      "COW",
      "Thirdspace",
    ]);
  });
  it("no Zone button when no zone category exists", () => {
    expect(eventTypeButtonNames(names("COW", "Gathering"))).toEqual(["COW"]);
  });
  it("Zone leads when there is no Churchwide", () => {
    expect(eventTypeButtonNames(names("COW", "Uni"))).toEqual(["Zone", "COW"]);
  });
});

describe("displayCategoryFor", () => {
  it("folds zone levels and undecided zone into Zone", () => {
    expect(displayCategoryFor("Youth")).toBe("Zone");
    expect(displayCategoryFor("", true)).toBe("Zone");
    expect(displayCategoryFor("COW")).toBe("COW");
    expect(displayCategoryFor("")).toBe("");
  });
});

describe("defaultQuickLevel", () => {
  const lv = names("COW", "Gathering", "Youth");
  it("keeps a remembered level that still exists", () => expect(defaultQuickLevel("COW", lv)).toBe("COW"));
  it("drops deleted, null and Gathering", () => {
    expect(defaultQuickLevel("Old", lv)).toBe("");
    expect(defaultQuickLevel(null, lv)).toBe("");
    expect(defaultQuickLevel("Gathering", lv)).toBe("");
  });
});

describe("validateQuickAdd", () => {
  const lv = names("COW", "Youth");
  const ok = { name: "TG", date: "2026-10-05", time: "", level: "COW" };
  it("passes a complete form", () => expect(validateQuickAdd(ok, lv)).toBeNull());
  it("requires name (whitespace is empty)", () => expect(validateQuickAdd({ ...ok, name: "  " }, lv)).toBe("Name is required."));
  it("requires level, with the zone wording", () => {
    expect(validateQuickAdd({ ...ok, level: "" }, lv)).toBe("Choose an Event Type.");
    expect(validateQuickAdd({ ...ok, level: "", zonePickedWithoutLevel: true }, lv)).toBe("Choose a zone.");
  });
  it("rejects a level that no longer exists", () =>
    expect(validateQuickAdd({ ...ok, level: "Gone" }, lv)).toContain("There's no “Gone” category"));
});

describe("buildQuickAddValues", () => {
  it("builds a single-day, non-recurring Event; blank time becomes null", () => {
    const v = buildQuickAddValues({ name: "  TG outing ", date: "2026-10-05", time: "", level: "COW" });
    expect(v).toMatchObject({
      name: "TG outing",
      event_date: "2026-10-05",
      event_time: null,
      level: "COW",
      recurring: "None",
      repeat_until: null,
      end_date: null,
      event_type: "Event",
      pastoral_youth: false,
      gathering_type: null,
    });
  });
  it("keeps a typed time", () =>
    expect(buildQuickAddValues({ name: "x", date: "2026-10-05", time: "19:30", level: "COW" }).event_time).toBe("19:30"));
});

describe("placePopover", () => {
  const size = { width: 320, height: 300 };
  const vp = { width: 1280, height: 800 };
  it("goes right of the cell when it fits", () => {
    expect(placePopover({ left: 100, top: 200, right: 280, bottom: 360 }, size, vp)).toEqual({ left: 288, top: 200 });
  });
  it("flips left near the right edge", () => {
    expect(placePopover({ left: 1100, top: 200, right: 1270, bottom: 360 }, size, vp).left).toBe(1100 - 8 - 320);
  });
  it("shifts up near the bottom and stays inside the viewport", () => {
    expect(placePopover({ left: 100, top: 700, right: 280, bottom: 800 }, size, vp).top).toBe(800 - 300 - 8);
  });
  it("centres and clamps when neither side fits", () => {
    const p = placePopover({ left: 10, top: 10, right: 390, bottom: 100 }, size, { width: 400, height: 800 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 320).toBeLessThanOrEqual(392);
  });
});

describe("validateQuickAdd date", () => {
  const lv = names("Youth");
  const base = { name: "X", time: "", level: "Youth" };
  it("accepts a real date within the supported years", () => {
    expect(validateQuickAdd({ ...base, date: "2026-05-17" }, lv)).toBeNull();
  });
  it("rejects missing, impossible, and out-of-range dates", () => {
    expect(validateQuickAdd({ ...base, date: "" }, lv)).toBe("Date is required.");
    expect(validateQuickAdd({ ...base, date: "2026-02-30" }, lv)).toBe("Pick a valid date.");
    expect(validateQuickAdd({ ...base, date: "1999-12-31" }, lv)).toMatch(/between 2000 and 2100/);
    expect(validateQuickAdd({ ...base, date: "2101-01-01" }, lv)).toMatch(/between 2000 and 2100/);
  });
  it("buildQuickAddValues saves the chosen date", () => {
    expect(buildQuickAddValues({ ...base, date: "2026-07-04" }).event_date).toBe("2026-07-04");
  });
});
