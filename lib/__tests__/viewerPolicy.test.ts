import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPathAllowedForRole } from "../auth";

// Viewer policy: read everything, and post comments in the sidebars; nothing
// else. This reads the Server Action sources (no Supabase needed) and checks
// that each exported action's Impl starts with the role listed here, so a new
// or loosened action fails the suite until this table is updated on purpose.
type Role = "viewer" | "editor";

// file -> exported action -> required role. Only the three entries marked
// VIEWER may be reached by a Viewer (two reads and the sidebar comment post).
const POLICY: Record<string, Record<string, Role>> = {
  "actions.ts": {
    moveOccurrence: "editor", retimeOccurrence: "editor", createEvent: "editor", updateEvent: "editor",
    getEventById: "viewer", deleteEvent: "editor", detachOccurrence: "editor",
    splitSeriesFromOccurrence: "editor", extendOccurrenceSpan: "editor", moveOccurrenceStart: "editor",
    deleteOccurrence: "editor",
  },
  "checklistActions.ts": {
    createChecklistItem: "editor", updateChecklistItem: "editor", updateChecklistStatus: "editor",
    deleteChecklistItem: "editor", logCheckCalendarSummary: "editor",
  },
  "checklistTemplateActions.ts": { saveChecklistTemplate: "editor", deleteChecklistTemplate: "editor" },
  "dayNoteActions.ts": { createDayNote: "editor", deleteDayNote: "editor" },
  "eventChecklistActions.ts": {
    getEventChecklist: "viewer", getChecklistTemplateOptions: "editor", applyChecklistTemplate: "editor",
    setChecklistItemDone: "editor", removeEventChecklist: "editor", addChecklistItem: "editor",
    removeChecklistItem: "editor",
  },
  "holidayActions.ts": { createHoliday: "editor", updateHoliday: "editor", deleteHoliday: "editor" },
  "levelActions.ts": { createLevel: "editor", updateLevel: "editor", deleteLevel: "editor" },
  "noteCommentActions.ts": { createNoteComment: "viewer", deleteNoteComment: "editor" },
  "reminderTemplateActions.ts": {
    createReminderTemplate: "editor", updateReminderTemplate: "editor", deleteReminderTemplate: "editor",
  },
  "seasonActions.ts": { createSeason: "editor", updateSeason: "editor", deleteSeason: "editor" },
  "seasonSourceDateActions.ts": { saveSeasonSourceDates: "editor" },
  "undo/restore.ts": { restoreSnapshot: "editor" },
};

const READ_ONLY_FOR_VIEWER = ["getEventById", "getEventChecklist", "createNoteComment"];

const lib = join(__dirname, "..");

// The role passed to requireRole() in the first statement of <name>Impl.
function roleOf(src: string, action: string): Role | null {
  const impl = `${action}Impl`;
  const at = src.indexOf(`async function ${impl}(`);
  if (at < 0) return null;
  const body = src.slice(src.indexOf("{", src.indexOf(")", at)), at + 1500);
  const m = body.match(/await requireRole\("(viewer|editor)"\)/);
  return m ? (m[1] as Role) : null;
}

describe("server action roles", () => {
  for (const [file, actions] of Object.entries(POLICY)) {
    const src = readFileSync(join(lib, file), "utf8");
    for (const [action, role] of Object.entries(actions)) {
      it(`${file}: ${action} requires ${role}`, () => {
        expect(roleOf(src, action)).toBe(role);
        expect(src).toMatch(new RegExp(`export async function ${action}\\(`));
      });
    }

    it(`${file}: every exported action is in the table`, () => {
      const exported = Array.from(src.matchAll(/export async function (\w+)\(/g)).map((m) => m[1]);
      expect(exported.sort()).toEqual(Object.keys(actions).sort());
    });
  }

  it("only reads and the sidebar comment post are open to Viewers", () => {
    const viewerLevel = Object.values(POLICY)
      .flatMap((a) => Object.entries(a))
      .filter(([, r]) => r === "viewer")
      .map(([n]) => n)
      .sort();
    expect(viewerLevel).toEqual([...READ_ONLY_FOR_VIEWER].sort());
  });
});

describe("api route roles", () => {
  const routes = [
    "app/api/holidays/fetch-year/route.ts",
    "app/api/export/ics/route.ts",
    "app/api/admin/backup/route.ts",
    "app/api/export/document/route.ts",
    "app/api/reminders/events/route.ts",
  ];
  for (const r of routes) {
    it(`${r} requires editor`, () => {
      const src = readFileSync(join(lib, "..", r), "utf8");
      expect(src).toContain('requireRoleRoute("editor")');
      expect(src).not.toContain('requireRoleRoute("viewer")');
    });
  }

  it("keeps a Viewer on the calendar, day pages and the activity feed only", () => {
    for (const p of ["/", "/day/2026-10-01", "/api/activity"]) expect(isPathAllowedForRole(p, "viewer")).toBe(true);
    for (const p of ["/checklist", "/holidays", "/seasons", "/levels", "/reminders", "/export", "/admin", "/api/admin/backup", "/api/holidays/fetch-year", "/api/reminders/events"]) {
      expect(isPathAllowedForRole(p, "viewer")).toBe(false);
    }
  });
});
