import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// middleware.ts imports via the "@/..." alias, which this repo's vitest setup
// doesn't resolve; point the aliases at the real modules.
vi.mock("@/lib/auth", async () => await import("../auth"));
vi.mock("@/lib/session", async () => await import("../session"));

import { middleware, config } from "../../middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "../session";

const SECRET = "test-secret-test-secret-test-secret-1234";
const saved = { ...process.env };

beforeEach(() => {
  process.env.EVO_SESSION_SECRET = SECRET;
  process.env.EVO_PASSCODE_EDITOR = "editor-pass";
  process.env.EVO_PASSCODE_VIEWER = "viewer-pass";
});
afterEach(() => {
  process.env = { ...saved };
});

async function req(path: string, role?: "editor" | "viewer", headers: Record<string, string> = {}) {
  const h = new Headers(headers);
  if (role) h.set("cookie", `${SESSION_COOKIE_NAME}=${(await createSessionToken(role))!}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: h });
}

const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";
const location = (res: Response) => res.headers.get("location");
// What the downstream handler will see for a request header.
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);
const overridden = (res: Response) => (res.headers.get("x-middleware-override-headers") ?? "").split(",");

describe("middleware matcher", () => {
  const re = new RegExp("^" + config.matcher[0] + "$");
  it("runs on app and api routes, skips static assets", () => {
    for (const p of ["/", "/reminders", "/api/admin/backup", "/login"]) expect(re.test(p), p).toBe(true);
    for (const p of ["/_next/static/a.js", "/_next/image", "/favicon.ico"]) expect(re.test(p), p).toBe(false);
  });
});

describe("middleware public paths", () => {
  it.each(["/login", "/api/login", "/api/logout", "/api/calendar-feed/x", "/api/calendar-feed/abc.ics"])(
    "%s is reachable without a session",
    async (p) => {
      expect(isNext(await middleware(await req(p)))).toBe(true);
    }
  );

  it("does not treat look-alike prefixes as public", async () => {
    for (const p of ["/loginx", "/api/loginx", "/api/logoutx", "/api/calendar-feedx", "/login-evil/../reminders"]) {
      expect(isNext(await middleware(await req(p))), p).toBe(false);
    }
  });

  it("strips a client-sent x-evo-role on public paths", async () => {
    const res = await middleware(await req("/login", undefined, { "x-evo-role": "editor" }));
    expect(isNext(res)).toBe(true);
    expect(overridden(res)).not.toContain("x-evo-role");
    expect(forwarded(res, "x-evo-role")).toBeNull();
  });
});

describe("middleware without a session", () => {
  it("redirects pages to /login", async () => {
    const res = await middleware(await req("/reminders"));
    expect(res.status).toBe(307);
    expect(new URL(location(res)!).pathname).toBe("/login");
  });

  it("returns JSON 401 (not a redirect) for /api/* routes", async () => {
    const res = await middleware(await req("/api/admin/backup"));
    expect(res.status).toBe(401);
    expect(location(res)).toBeNull();
    expect((await res.json()).error).toMatch(/session/i);
  });

  it("rejects a garbage / forged cookie", async () => {
    const forged = new NextRequest(new URL("/reminders", "http://localhost:3000"), {
      headers: { cookie: `${SESSION_COOKIE_NAME}=viewer:viewer-pass` },
    });
    expect(isNext(await middleware(forged))).toBe(false);
  });

  it("does not trust a spoofed x-evo-role header without a session", async () => {
    const res = await middleware(await req("/reminders", undefined, { "x-evo-role": "editor" }));
    expect(isNext(res)).toBe(false);
  });

  it("fails closed when the session secret is not configured", async () => {
    const r = await req("/", "editor");
    delete process.env.EVO_SESSION_SECRET;
    expect(isNext(await middleware(r))).toBe(false);
  });
});

describe("middleware with a session", () => {
  it("blocks a Viewer from /reminders and editor-only API routes", async () => {
    const page = await middleware(await req("/reminders", "viewer"));
    expect(page.status).toBe(307);
    const bounced = new URL(location(page)!);
    expect(bounced.pathname).toBe("/");
    expect(bounced.searchParams.get("notice")).toBe("editors-only");
    const api = await middleware(await req("/api/admin/backup", "viewer"));
    expect(isNext(api)).toBe(false);
  });

  it("lets a Viewer reach the calendar, day pages and the activity feed", async () => {
    for (const p of ["/", "/day/2026-10-01", "/api/activity"]) {
      expect(isNext(await middleware(await req(p, "viewer"))), p).toBe(true);
    }
  });

  it("lets a Viewer reach the Export pages and their API routes, but not look-alikes", async () => {
    for (const p of ["/export", "/export/calendar", "/export/print", "/api/export/ics", "/api/export/document"]) {
      expect(isNext(await middleware(await req(p, "viewer"))), p).toBe(true);
    }
    for (const p of ["/exportx", "/reminders", "/admin/backup", "/api/admin/backup", "/api/holidays/fetch-year", "/api/reminders/events", "/seasons/import", "/api/schedules/parse", "/api/excel/parse"]) {
      expect(isNext(await middleware(await req(p, "viewer"))), p).toBe(false);
    }
  });

  it("blocks Viewer traversal / encoding / case tricks around Export", async () => {
    // Outcomes asserted against the real middleware; WHATWG URL parsing may
    // collapse some of these to "/reminders" before the allow-list sees them.
    for (const p of [
      "/export/%2e%2e/reminders", "/export//", "/Export", "/export/../reminders",
      "/export%2Freminders", "/export/%2Freminders", "/api/export/icsx", "/export/admin",
    ]) {
      const res = await middleware(await req(p, "viewer"));
      expect(isNext(res), p).toBe(false);
      expect(new URL(location(res)!).searchParams.get("notice"), p).toBe("editors-only");
    }
  });

  it("treats a single trailing slash on an allowed Export route as that route", async () => {
    for (const p of ["/export/", "/api/export/ics/"]) {
      expect(isNext(await middleware(await req(p, "viewer"))), p).toBe(true);
    }
  });

  it("lets an Editor reach /reminders, /api/admin/backup and the schedule import", async () => {
    for (const p of ["/reminders", "/api/admin/backup", "/seasons/import", "/api/schedules/parse", "/api/excel/parse"]) {
      expect(isNext(await middleware(await req(p, "editor"))), p).toBe(true);
    }
  });

  it("sets x-evo-role from the verified session, overriding a client-sent value", async () => {
    const res = await middleware(await req("/", "viewer", { "x-evo-role": "editor" }));
    expect(isNext(res)).toBe(true);
    expect(forwarded(res, "x-evo-role")).toBe("viewer");
    const ed = await middleware(await req("/", "editor", { "x-evo-role": "viewer" }));
    expect(forwarded(ed, "x-evo-role")).toBe("editor");
  });
});
