import { describe, it, expect } from "vitest";
import {
  activityHref,
  canRoleSeeEntity,
  hrefForRole,
  summaryFor,
  truncateLabel,
  VIEWER_ENTITIES,
} from "../activityFormat";

describe("activityHref", () => {
  it("links events to their month with an event focus", () => {
    expect(activityHref("event", "abc", "2026-10-09")).toBe("/?year=2026&month=10&focus=event:abc");
  });
  it("uses the item date as the focus key for holidays and day notes", () => {
    expect(activityHref("holiday", "id1", "2026-12-25")).toBe("/?year=2026&month=12&focus=holiday:2026-12-25");
    expect(activityHref("day_note", "id2", "2026-03-04")).toBe("/?year=2026&month=3&focus=day:2026-03-04");
  });
  it("links seasons by id and notes/comments by notes focus", () => {
    expect(activityHref("season", "s1", "2026-05-01")).toBe("/?year=2026&month=5&focus=season:s1");
    expect(activityHref("note", "n1", "2026-05-01")).toBe("/?year=2026&month=5&focus=notes");
    expect(activityHref("comment", "n2", null)).toBe("/?focus=notes");
  });
  it("falls back to / with no date and no focus", () => {
    expect(activityHref("event", null, null)).toBe("/");
    expect(activityHref("holiday", "x", null)).toBe("/");
  });
  it("routes categories, checklist and undo", () => {
    expect(activityHref("category", "c", null)).toBe("/levels");
    expect(activityHref("checklist", "c", "2026-01-01")).toBe("/checklist");
    expect(activityHref("undo", null, null)).toBeNull();
  });
});

describe("truncateLabel / summaryFor", () => {
  it("truncates to 40 chars with an ellipsis", () => {
    const out = truncateLabel("x".repeat(60));
    expect(out).toHaveLength(40);
    expect(out.endsWith("…")).toBe(true);
    expect(truncateLabel("Short")).toBe("Short");
  });
  it("builds sentences for each action", () => {
    expect(summaryFor("editor", "added", "event", "Youth Camp")).toBe("Editor added event “Youth Camp”");
    expect(summaryFor("viewer", "edited", "event", "Youth Camp")).toBe("Viewer edited event “Youth Camp”");
    expect(summaryFor("editor", "moved", "event", "Youth Camp")).toBe("Editor moved “Youth Camp”");
    expect(summaryFor("editor", "deleted", "holiday", "Teachers' Day")).toBe("Editor deleted holiday “Teachers' Day”");
    expect(summaryFor("viewer", "commented", "note", "General Notes")).toBe("Viewer commented on General Notes");
    expect(summaryFor("editor", "deleted", "comment", "Month Notes")).toBe("Editor deleted a comment on Month Notes");
    expect(summaryFor("editor", "undid", "undo", "a change")).toBe("Editor undid a change");
    expect(summaryFor("viewer", "redid", "undo", "a change")).toBe("Viewer redid a change");
    expect(summaryFor("editor", "edited", "checklist", "Book venue")).toBe("Editor edited checklist item “Book venue”");
  });
  it("keeps long labels within ~75 chars", () => {
    expect(summaryFor("editor", "deleted", "checklist", "y".repeat(100)).length).toBeLessThanOrEqual(75);
  });
});

describe("role filtering", () => {
  it("limits viewers to calendar-visible entities", () => {
    for (const e of VIEWER_ENTITIES) expect(canRoleSeeEntity("viewer", e)).toBe(true);
    expect(canRoleSeeEntity("viewer", "category")).toBe(false);
    expect(canRoleSeeEntity("viewer", "checklist")).toBe(false);
    expect(canRoleSeeEntity("viewer", "undo")).toBe(false);
    expect(canRoleSeeEntity("editor", "undo")).toBe(true);
  });
  it("nulls non-calendar hrefs for viewers only", () => {
    expect(hrefForRole("/levels", "viewer")).toBeNull();
    expect(hrefForRole("/checklist", "viewer")).toBeNull();
    expect(hrefForRole("/?year=2026&month=3", "viewer")).toBe("/?year=2026&month=3");
    expect(hrefForRole("/", "viewer")).toBe("/");
    expect(hrefForRole("/levels", "editor")).toBe("/levels");
    expect(hrefForRole(null, "viewer")).toBeNull();
  });
});
