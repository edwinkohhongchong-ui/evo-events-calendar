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
  it("allows only the exact Export pages, not future sub-paths", () => {
    for (const p of ["/export/admin", "/export/calendar/x", "/export/print/x", "/api/export/ics/x", "/api/export/document/x"]) {
      expect(isPathAllowedForRole(p, "viewer"), p).toBe(false);
      expect(isPathAllowedForRole(p, "editor"), p).toBe(true);
    }
  });
  it("treats one trailing slash like Next does, nothing more", () => {
    expect(isPathAllowedForRole("/export/", "viewer")).toBe(true);
    expect(isPathAllowedForRole("/api/export/ics/", "viewer")).toBe(true);
    expect(isPathAllowedForRole("/export//", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/Export", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/export/../reminders", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/export%2Freminders", "viewer")).toBe(false);
    expect(isPathAllowedForRole("/export/%2Freminders", "viewer")).toBe(false);
  });
});

describe("schedule import is Editor-only", () => {
  it("blocks Viewers from the import page and its parse endpoint, allows Editors", () => {
    for (const p of ["/seasons/import", "/api/schedules/parse", "/api/excel/parse"]) {
      expect(isPathAllowedForRole(p, "viewer"), p).toBe(false);
      expect(isPathAllowedForRole(p, "editor"), p).toBe(true);
    }
  });
});
