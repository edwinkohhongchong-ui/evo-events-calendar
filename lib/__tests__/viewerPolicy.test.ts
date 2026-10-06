import { describe, it, expect } from "vitest";
import { isPathAllowedForRole, VIEWER_EXPORT_PATHS } from "../auth";
import {
  exportViolations,
  exportedAsyncFunctions,
  exportedHttpMethods,
  functionBody,
  isExactWrapper,
  leadingRole,
  listExportPages,
  listInlineUseServer,
  listRouteFiles,
  listUseServerFiles,
  read,
  squash,
  stripComments,
} from "./policySource";

// Viewer policy: read everything, and post comments in the sidebars; nothing
// else. This reads the Server Action / route sources (no Supabase needed). The
// "use server" files and route handlers are DISCOVERED from disk, and any file
// not listed here fails the suite, so a new Actions file or API route cannot
// slip in without an explicit, reviewed policy entry.
type Role = "viewer" | "editor";

// file -> exported action -> required role. Only the three entries marked
// "viewer" may be reached by a Viewer (two reads, the sidebar comment post and
// ticking an event checklist item).
const POLICY: Record<string, Record<string, Role>> = {
  "lib/actions.ts": {
    moveOccurrence: "editor", retimeOccurrence: "editor", createEvent: "editor", updateEvent: "editor",
    getEventById: "viewer", deleteEvent: "editor", detachOccurrence: "editor",
    splitSeriesFromOccurrence: "editor", extendOccurrenceSpan: "editor", moveOccurrenceStart: "editor",
    deleteOccurrence: "editor",
  },
  "lib/checklistActions.ts": {
    createChecklistItem: "editor", updateChecklistItem: "editor", updateChecklistStatus: "editor",
    deleteChecklistItem: "editor", logCheckCalendarSummary: "editor",
  },
  "lib/checklistTemplateActions.ts": { saveChecklistTemplate: "editor", deleteChecklistTemplate: "editor" },
  "lib/dayNoteActions.ts": { createDayNote: "editor", updateDayNote: "editor", deleteDayNote: "editor" },
  "lib/eventChecklistActions.ts": {
    getEventChecklist: "viewer", getChecklistTemplateOptions: "editor", applyChecklistTemplate: "editor",
    setChecklistItemDone: "viewer", removeEventChecklist: "editor", addChecklistItem: "editor",
    removeChecklistItem: "editor", setChecklistItemOwner: "editor", editChecklistItem: "editor",
    getOwnerOptions: "editor",
  },
  "lib/holidayActions.ts": { createHoliday: "editor", updateHoliday: "editor", deleteHoliday: "editor" },
  "lib/levelActions.ts": { createLevel: "editor", updateLevel: "editor", deleteLevel: "editor" },
  "lib/noteCommentActions.ts": { createNoteComment: "viewer", deleteNoteComment: "editor" },
  "lib/reminderTemplateActions.ts": {
    createReminderTemplate: "editor", updateReminderTemplate: "editor", deleteReminderTemplate: "editor",
  },
  "lib/excelImportActions.ts": { applyExcelImport: "editor" },
  "lib/scheduleImportActions.ts": { applyScheduleImport: "editor" },
  "lib/seasonActions.ts": { createSeason: "editor", updateSeason: "editor", deleteSeason: "editor" },
  "lib/seasonSourceDateActions.ts": { saveSeasonSourceDates: "editor" },
  "lib/undo/restore.ts": { restoreSnapshot: "editor" },
};

// "use server" files that are not Impl/runAction action files. authz.ts IS the
// guard: its only export is requireRole, which mutates nothing.
const GUARD_FILES: Record<string, string[]> = { "lib/authz.ts": ["requireRole"] };

const VIEWER_LEVEL = ["getEventById", "getEventChecklist", "setChecklistItemDone", "createNoteComment"];

describe("server action files are fully covered", () => {
  it("finds the \"use server\" files on disk (guards the glob itself)", () => {
    expect(listUseServerFiles().length).toBeGreaterThanOrEqual(Object.keys(POLICY).length);
  });

  it("every \"use server\" file is in the policy table (or an explicit guard file)", () => {
    const known = [...Object.keys(POLICY), ...Object.keys(GUARD_FILES)].sort();
    expect(listUseServerFiles()).toEqual(known);
  });

  it("no inline function-level \"use server\" directives hide in other files", () => {
    expect(listInlineUseServer()).toEqual([]);
  });

  for (const [file, exports] of Object.entries(GUARD_FILES)) {
    it(`${file}: exports exactly ${exports.join(", ")} and nothing else`, () => {
      const code = stripComments(read(file));
      expect(exportedAsyncFunctions(code)).toEqual([...exports].sort());
      expect(exportViolations(code)).toEqual([]);
    });
  }

  for (const [file, actions] of Object.entries(POLICY)) {
    const code = stripComments(read(file));

    describe(file, () => {
      for (const [action, role] of Object.entries(actions)) {
        it(`${action}: requireRole("${role}") is the first statement of ${action}Impl`, () => {
          const body = functionBody(code, `${action}Impl`);
          expect(body, `${action}Impl body not found/parsable`).not.toBeNull();
          expect(leadingRole(body)).toBe(role);
        });

        it(`${action}: exported wrapper is exactly runAction(() => ${action}Impl(...args))`, () => {
          expect(isExactWrapper(code, action)).toBe(true);
        });
      }

      it("every exported async function is in the table", () => {
        expect(exportedAsyncFunctions(code)).toEqual(Object.keys(actions).sort());
      });

      it("exports nothing but `export async function` (no const/default/sync/re-exports)", () => {
        expect(exportViolations(code)).toEqual([]);
      });
    });
  }

  it("every checklist action except reading and ticking stays Editor-only", () => {
    const open = new Set(["getEventChecklist", "setChecklistItemDone"]);
    for (const [name, role] of Object.entries(POLICY["lib/eventChecklistActions.ts"])) {
      expect(role, name).toBe(open.has(name) ? "viewer" : "editor");
    }
  });

  it("only reads, ticking a checklist item and the sidebar comment post are open to Viewers", () => {
    const viewerLevel = Object.values(POLICY)
      .flatMap((a) => Object.entries(a))
      .filter(([, r]) => r === "viewer")
      .map(([n]) => n)
      .sort();
    expect(viewerLevel).toEqual([...VIEWER_LEVEL].sort());
  });
});

// ---- API routes ---------------------------------------------------------

type RouteKind =
  | { kind: "editor"; methods: string[] } // requireRoleRoute("editor") first, before any db/network access
  | { kind: "viewer-read"; methods: string[] } // requireRoleRoute("viewer") first; read-only export, must not write
  | { kind: "session"; methods: string[] } // verifySessionToken gate before any data access (any role)
  | { kind: "token"; methods: string[] } // secret-URL token compared before any data access
  | { kind: "public-login"; methods: string[] } // issues sessions; public in middleware
  | { kind: "public-logout"; methods: string[] }; // clears the session cookie only; public in middleware so it works for any role/expired session

const ROUTES: Record<string, RouteKind> = {
  "app/api/holidays/fetch-year/route.ts": { kind: "editor", methods: ["POST"] },
  "app/api/schedules/parse/route.ts": { kind: "editor", methods: ["POST"] },
  "app/api/excel/parse/route.ts": { kind: "editor", methods: ["POST"] },
  "app/api/export/ics/route.ts": { kind: "viewer-read", methods: ["GET"] },
  "app/api/admin/backup/route.ts": { kind: "editor", methods: ["GET"] },
  "app/api/export/document/route.ts": { kind: "viewer-read", methods: ["POST"] },
  "app/api/reminders/events/route.ts": { kind: "editor", methods: ["GET"] },
  "app/api/activity/route.ts": { kind: "session", methods: ["GET"] },
  "app/api/calendar-feed/[token]/route.ts": { kind: "token", methods: ["GET"] },
  "app/api/login/route.ts": { kind: "public-login", methods: ["POST"] },
  "app/api/logout/route.ts": { kind: "public-logout", methods: ["POST"] },
};

const DATA_ACCESS = /\bsupabase\b|\bfetch\s*\(|\.from\s*\(/;

describe("api routes are fully covered", () => {
  it("every route.ts under app/ is in the route table", () => {
    expect(listRouteFiles()).toEqual(Object.keys(ROUTES).sort());
  });

  for (const [file, spec] of Object.entries(ROUTES)) {
    const code = stripComments(read(file));

    describe(file, () => {
      it(`exports exactly the expected HTTP methods (${spec.methods.join(", ")})`, () => {
        expect(exportedHttpMethods(code)).toEqual([...spec.methods].sort());
      });

      for (const method of spec.methods) {
        const body = () => functionBody(code, method);

        if (spec.kind === "editor") {
          it(`${method}: requireRoleRoute("editor") is the first statement and returns on denial`, () => {
            expect(body(), "handler body not found").not.toBeNull();
            expect(squash(body()!)).toMatch(/^const denied = await requireRoleRoute\("editor"\); if \(denied\) return denied;/);
            expect(code).not.toContain('requireRoleRoute("viewer")');
          });

          it(`${method}: the role check precedes any supabase / fetch( / .from( access`, () => {
            const b = body()!;
            const gate = b.indexOf('requireRoleRoute("editor")');
            const access = b.search(DATA_ACCESS);
            expect(gate).toBeGreaterThanOrEqual(0);
            if (access >= 0) expect(gate).toBeLessThan(access);
          });
        }

        if (spec.kind === "viewer-read") {
          it(`${method}: requireRoleRoute("viewer") is the first statement and returns on denial`, () => {
            expect(body(), "handler body not found").not.toBeNull();
            expect(squash(body()!)).toMatch(/^const denied = await requireRoleRoute\("viewer"\); if \(denied\) return denied;/);
            expect(code).not.toContain('requireRoleRoute("editor")');
          });

          it(`${method}: the role check precedes any supabase / fetch( / .from( access`, () => {
            const b = body()!;
            const gate = b.indexOf('requireRoleRoute("viewer")');
            const access = b.search(DATA_ACCESS);
            expect(gate).toBeGreaterThanOrEqual(0);
            if (access >= 0) expect(gate).toBeLessThan(access);
          });

          it("is read-only: no insert/update/upsert/delete and no activity logging", () => {
            expect(code).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
            expect(code).not.toMatch(/activity|logActivity|revalidate/i);
          });
        }

        if (spec.kind === "session") {
          it(`${method}: verifies the session and 401s before touching data`, () => {
            const b = body()!;
            expect(squash(b)).toMatch(/^const role = await verifySessionToken\(/);
            expect(b).toMatch(/if \(!role\)\s*\{\s*return [^;]*status: 401/);
            expect(b.indexOf("verifySessionToken(")).toBeLessThan(b.search(/getRecentActivity\(|\bsupabase\b/));
          });
        }

        if (spec.kind === "token") {
          it(`${method}: fails closed on a missing/mismatched token before any db access`, () => {
            const b = body()!;
            expect(b).toContain("!expectedToken");
            const check = b.indexOf("timingSafeTokenMatch(");
            expect(check).toBeGreaterThanOrEqual(0);
            expect(check).toBeLessThan(b.search(DATA_ACCESS));
          });
        }

        if (spec.kind === "public-login") {
          it(`${method}: issues sessions only after the safeEqual passcode check`, () => {
            const b = body()!;
            expect(b).toContain("createSessionToken(");
            expect(b).toContain("safeEqual(");
            expect(b.indexOf("safeEqual(")).toBeLessThan(b.indexOf("createSessionToken("));
          });
        }

        if (spec.kind === "public-logout") {
          it(`${method}: only clears the cookie (maxAge 0) and touches no data`, () => {
            const b = body()!;
            expect(b).toContain("maxAge: 0");
            expect(b).not.toMatch(DATA_ACCESS);
            expect(b).not.toContain("createSessionToken(");
          });
        }
      }
    });
  }

  it("keeps a Viewer on the calendar, day pages, the activity feed and Export only", () => {
    for (const p of ["/", "/day/2026-10-01", "/api/activity", "/export", "/export/calendar", "/export/print", "/api/export/ics", "/api/export/document"]) {
      expect(isPathAllowedForRole(p, "viewer"), p).toBe(true);
    }
    for (const p of ["/checklist", "/holidays", "/seasons", "/levels", "/reminders", "/exportx", "/admin", "/api/admin/backup", "/api/holidays/fetch-year", "/api/reminders/events", "/seasons/import", "/api/schedules/parse", "/api/excel/parse"]) {
      expect(isPathAllowedForRole(p, "viewer")).toBe(false);
    }
  });

  it("every viewer-read route path is reachable by a Viewer via the path policy", () => {
    for (const [file, spec] of Object.entries(ROUTES)) {
      if (spec.kind !== "viewer-read") continue;
      const path = "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
      expect(isPathAllowedForRole(path, "viewer"), path).toBe(true);
    }
  });

  it("every editor-only route path is also blocked for Viewers by the path policy", () => {
    for (const [file, spec] of Object.entries(ROUTES)) {
      if (spec.kind !== "editor") continue;
      const path = "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");
      expect(isPathAllowedForRole(path, "viewer"), path).toBe(false);
    }
  });
});

// ---- Self-tests: prove the checkers above fail on broken source ----------

describe("policy checkers detect violations", () => {
  const good = `async function fooImpl(a: string): Promise<void> {\n  await requireRole("editor");\n  doIt();\n}`;
  const body = (src: string, name = "fooImpl") => functionBody(stripComments(src), name);

  it("accepts requireRole as first statement, ignoring comments and blank lines", () => {
    expect(leadingRole(body(`async function fooImpl() {\n\n  // why\n  /* x */\n  await requireRole("viewer");\n}`))).toBe("viewer");
    expect(leadingRole(body(good))).toBe("editor");
  });

  it("rejects requireRole that is not first, missing, or not awaited", () => {
    expect(leadingRole(body(`async function fooImpl() { const x = 1; await requireRole("editor"); }`))).toBeNull();
    expect(leadingRole(body(`async function fooImpl() { doIt(); }`))).toBeNull();
    expect(leadingRole(body(`async function fooImpl() { requireRole("editor"); }`))).toBeNull();
    expect(leadingRole(body(`async function fooImpl() { if (x) await requireRole("editor"); }`))).toBeNull();
  });

  it("reports the actual role so a loosened editor->viewer change is caught", () => {
    expect(leadingRole(body(good.replace('"editor"', '"viewer"')))).toBe("viewer");
  });

  it("ignores a requireRole that only appears inside a comment", () => {
    expect(leadingRole(body(`async function fooImpl() { // await requireRole("editor");\n doIt(); }`))).toBeNull();
  });

  it("parses bodies with object-typed params and Promise<{...}> returns", () => {
    const src = `async function fooImpl(v: { a: number }, o?: string): Promise<{ ok: boolean }> {\n await requireRole("editor"); }`;
    expect(leadingRole(body(src))).toBe("editor");
  });

  const wrapper = (inner: string, sig = "...args: Parameters<typeof fooImpl>") =>
    stripComments(`export async function foo(${sig}) {\n  ${inner}\n}`);

  it("wrapper check accepts only the exact runAction(() => fooImpl(...args)) shape", () => {
    expect(isExactWrapper(wrapper("return runAction(() => fooImpl(...args));"), "foo")).toBe(true);
    expect(isExactWrapper(wrapper("return runAction(() => barImpl(...args));"), "foo")).toBe(false);
    expect(isExactWrapper(wrapper("return fooImpl(...args);"), "foo")).toBe(false);
    expect(isExactWrapper(wrapper("doSomething(); return runAction(() => fooImpl(...args));"), "foo")).toBe(false);
    expect(isExactWrapper(wrapper("return runAction(() => fooImpl(...args));", "id: string"), "foo")).toBe(false);
    expect(isExactWrapper(wrapper("return runAction(() => fooImpl(...args));"), "bar")).toBe(false);
  });

  it("export check flags const/default/re-export/sync/class exports", () => {
    const ok = `export async function a() {}\nexport type T = string;\nexport interface I {}`;
    expect(exportViolations(stripComments(ok))).toEqual([]);
    for (const bad of [
      "export const x = async () => {};",
      "export default async function () {}",
      "export default async () => {};",
      "export { a } from './a';",
      "export * from './a';",
      "export function sync() {}",
      "export class C {}",
    ]) {
      expect(exportViolations(stripComments(bad)), bad).toHaveLength(1);
    }
  });

  it("route method detection catches const-style and re-exported handlers", () => {
    expect(exportedHttpMethods("export async function GET() {}")).toEqual(["GET"]);
    expect(exportedHttpMethods("export const POST = async () => {}")).toEqual(["POST"]);
    expect(exportedHttpMethods("export { handler as DELETE }")).toEqual(["DELETE"]);
    expect(exportedHttpMethods("export const dynamic = 'force-dynamic'")).toEqual([]);
  });

  it("the DATA_ACCESS ordering check would catch a db call placed before the role gate", () => {
    const broken = `const rows = await supabase.from("events").select(); const denied = await requireRoleRoute("editor");`;
    expect(broken.indexOf('requireRoleRoute("editor")')).toBeGreaterThan(broken.search(DATA_ACCESS));
  });

  it("stripComments keeps URLs in strings but drops real comments", () => {
    const s = stripComments(`const u = "https://x.y"; // note\n/* block */ const v = 1;`);
    expect(s).toContain("https://x.y");
    expect(s).not.toContain("note");
    expect(s).not.toContain("block");
  });
});

describe("Viewer Export allow-list", () => {
  it("every page under app/export is a deliberate Viewer decision", () => {
    // Adding a page under app/export fails here until it is added to
    // VIEWER_EXPORT_PATHS (Viewer-visible) or this expectation is updated
    // (and the page is then Editor-only by default).
    expect(listExportPages()).toEqual(["/export", "/export/calendar", "/export/print"]);
    for (const page of listExportPages()) {
      expect(VIEWER_EXPORT_PATHS, page).toContain(page);
      expect(isPathAllowedForRole(page, "viewer"), page).toBe(true);
    }
  });
});
