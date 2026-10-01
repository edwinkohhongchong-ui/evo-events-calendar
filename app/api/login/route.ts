import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, Role, serializeAuthCookie } from "@/lib/auth";
import { safeEqual } from "@/lib/safeEqual";

// Best-effort brute-force throttle: failures per client IP in a sliding
// window. Serverless instances don't share memory, so an attacker spread over
// cold instances can get around this; Vercel WAF rate limiting is the stronger
// fix (Edwin's decision). It still stops casual guessing against one instance.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const WRONG_PASSCODE_DELAY_MS = 600;
const failures = new Map<string, number[]>();

function recentFailures(key: string, now: number): number[] {
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length) failures.set(key, recent);
  else failures.delete(key);
  return recent;
}

function pruneOldEntries(now: number) {
  failures.forEach((_, key) => recentFailures(key, now));
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneOldEntries(now);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (recentFailures(ip, now).length >= MAX_FAILURES) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const { role, passcode } = await request.json().catch(() => ({ role: null, passcode: null }));

  if (role !== "editor" && role !== "viewer") {
    return NextResponse.json({ error: "Choose Edit or View access." }, { status: 400 });
  }
  const typedRole = role as Role;

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
    failures.set(ip, [...recentFailures(ip, now), now]);
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSCODE_DELAY_MS));
    return NextResponse.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, serializeAuthCookie(typedRole, passcode), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
