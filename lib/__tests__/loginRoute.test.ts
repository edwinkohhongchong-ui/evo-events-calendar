import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", async () => await import("../auth"));
vi.mock("@/lib/session", async () => await import("../session"));
vi.mock("@/lib/safeEqual", async () => await import("../safeEqual"));
vi.mock("@/lib/loginThrottle", async () => await import("../loginThrottle"));

import { POST } from "../../app/api/login/route";
import { ipFailures, roleFailures } from "../loginThrottle";

const EDITOR = "editor-secret-AAA";
const VIEWER = "viewer-secret-BBB";

function req(body: unknown, ip = "9.9.9.9") {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

let logs: string[];
beforeEach(() => {
  process.env.EVO_SESSION_SECRET = "s".repeat(40);
  process.env.EVO_PASSCODE_EDITOR = EDITOR;
  process.env.EVO_PASSCODE_VIEWER = VIEWER;
  ipFailures.clear();
  roleFailures.clear();
  logs = [];
  for (const m of ["info", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });
  }
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function post(body: unknown, ip?: string) {
  let done = false;
  const p = POST(req(body, ip)).finally(() => { done = true; });
  // The delay timer is created after awaits, so keep advancing until settled.
  for (let i = 0; i < 50 && !done; i++) await vi.advanceTimersByTimeAsync(500);
  return p;
}

describe("POST /api/login", () => {
  it("logs failures without any passcode content or the raw IP, with a generic error", async () => {
    const typed = "typedGuess123";
    const res = await post({ role: "editor", passcode: typed }, "203.0.113.7");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Incorrect passcode.");
    const all = logs.join("\n");
    expect(all).toContain("login_failed");
    expect(all).toContain('"role":"editor"');
    for (const secret of [typed, EDITOR, VIEWER, "203.0.113.7", "typedGuess", String(typed.length) + ","]) {
      expect(all).not.toContain(secret);
    }
  });

  it("gives the same response whichever role's passcode was typed", async () => {
    const a = await post({ role: "editor", passcode: VIEWER });
    const b = await post({ role: "viewer", passcode: EDITOR });
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });

  it("locks an IP out after repeated failures, even for the right passcode", async () => {
    for (let i = 0; i < 8; i++) expect((await post({ role: "viewer", passcode: "x" }, "5.5.5.5")).status).toBe(401);
    expect((await post({ role: "viewer", passcode: VIEWER }, "5.5.5.5")).status).toBe(429);
    expect((await post({ role: "viewer", passcode: VIEWER }, "6.6.6.6")).status).toBe(200);
  });

  it("caps failures globally per role across different IPs", async () => {
    for (let i = 0; i < 60; i++) await post({ role: "editor", passcode: "x" }, `10.0.0.${i}`);
    expect((await post({ role: "editor", passcode: "x" }, "11.0.0.1")).status).toBe(429);
    expect((await post({ role: "viewer", passcode: VIEWER }, "11.0.0.2")).status).toBe(200);
  });

  it("logs a successful login without the passcode", async () => {
    const res = await post({ role: "editor", passcode: EDITOR });
    expect(res.status).toBe(200);
    expect(logs.join("\n")).not.toContain(EDITOR);
  });
});
