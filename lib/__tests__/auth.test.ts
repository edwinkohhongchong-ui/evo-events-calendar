import { describe, it, expect } from "vitest";
import { isPathAllowedForRole } from "../auth";

describe("isPathAllowedForRole", () => {
  it("lets editors reach everything", () => {
    expect(isPathAllowedForRole("/checklist", "editor")).toBe(true);
    expect(isPathAllowedForRole("/api/export/ics", "editor")).toBe(true);
  });
  it("limits viewers to the calendar, the activity feed and Export", () => {
    expect(isPathAllowedForRole("/", "viewer")).toBe(true);
    expect(isPathAllowedForRole("/day/2026-10-01", "viewer")).toBe(true);
    expect(isPathAllowedForRole("/api/activity", "viewer")).toBe(true);
    for (const p of ["/export", "/export/calendar", "/export/print", "/api/export/ics", "/api/export/document"]) {
      expect(isPathAllowedForRole(p, "viewer"), p).toBe(true);
    }
  });
  it("still blocks every other viewer route, including other /api paths", () => {
    expect(isPathAllowedForRole("/checklist", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/reminders", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/reminders", "editor")).toBe(true);
    expect(isPathAllowedForRole("/api/activity/extra", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/api/admin/backup", "viewer")).toBe(false);
    for (const p of ["/exportx", "/export-evil", "/api/exportx", "/api/export", "/api/export/other", "/api/export/icsx", "/api/export/documentx"]) {
      expect(isPathAllowedForRole(p, "viewer"), p).toBe(false);
    }
  });
});
