import { NextRequest, NextResponse } from "next/server";
import { expectedPasscodeFor, Role } from "@/lib/auth";
import { SESSION_COOKIE_NAME, createSessionToken, getSessionSecret, sessionCookieOptions } from "@/lib/session";
import { safeEqual } from "@/lib/safeEqual";
import {
  MAX_FAILURES_PER_IP, MAX_FAILURES_PER_ROLE, WINDOW_MS,
  clientIp, failureDelayMs, hashIp, ipFailures, roleFailures,
} from "@/lib/loginThrottle";

// Brute-force throttle (see lib/loginThrottle.ts): per-IP failures, a global
// per-role failure cap, escalating delay after each wrong passcode, and safe
// logging. Memory is per serverless instance, so Vercel WAF rate limiting on
// POST /api/login remains the stronger, cross-instance control.

function logLogin(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  // Never include the typed or expected passcode, or any part/length of them.
  const line = JSON.stringify({ event, at: new Date().toISOString(), ...fields });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  ipFailures.prune(now);
  roleFailures.prune(now);
  const ip = clientIp(request.headers);
  const ipHash = await hashIp(ip, getSessionSecret() ?? "unconfigured");
  if (ipFailures.count(ip, now) >= MAX_FAILURES_PER_IP) {
    logLogin("error", "login_throttled", { scope: "ip", ip: ipHash, ipFailures: ipFailures.count(ip, now) });
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const { role, passcode } = await request.json().catch(() => ({ role: null, passcode: null }));

  if (role !== "editor" && role !== "viewer") {
    return NextResponse.json({ error: "Choose Edit or View access." }, { status: 400 });
  }
  const typedRole = role as Role;

  if (roleFailures.count(typedRole, now) >= MAX_FAILURES_PER_ROLE) {
    logLogin("error", "login_throttled", { scope: "role", role: typedRole, ip: ipHash, roleFailures: roleFailures.count(typedRole, now) });
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  // Fail closed: without a usable signing secret no session can be issued.
  if (!getSessionSecret()) {
    console.error("Login unavailable: EVO_SESSION_SECRET is missing or shorter than 32 characters.");
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }

  const expected = expectedPasscodeFor(typedRole);
  if (!expected) {
    return NextResponse.json(
      { error: "Server is not configured with a passcode for this role." },
      { status: 500 }
    );
  }

  // Deliberately generic — same message regardless of role, so a wrong
  // guess doesn't reveal whether the Editor or Viewer passcode was closer.
  if (typeof passcode !== "string" || !safeEqual(passcode, expected)) {
    const before = ipFailures.count(ip, now);
    const ipCount = ipFailures.record(ip, now);
    const roleCount = roleFailures.record(typedRole, now);
    logLogin("warn", "login_failed", { role: typedRole, ip: ipHash, ipFailures: ipCount, roleFailures: roleCount, windowMin: WINDOW_MS / 60000 });
    await new Promise((resolve) => setTimeout(resolve, failureDelayMs(before)));
    return NextResponse.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  const token = await createSessionToken(typedRole);
  if (!token) {
    console.error("Login failed: could not create a session token.");
    return NextResponse.json({ error: "Login is temporarily unavailable." }, { status: 500 });
  }
  logLogin("info", "login_success", { role: typedRole, ip: ipHash });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
