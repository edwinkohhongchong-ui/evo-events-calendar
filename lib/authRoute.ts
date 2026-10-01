import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, parseAuthCookie } from "./auth";
import { safeEqual } from "./safeEqual";

// Route-handler counterpart of lib/authz.ts#requireRole. Middleware already
// enforces this for /api/*; calling it first in a handler is defence in depth.
// Usage: `const denied = await requireRoleRoute("editor"); if (denied) return denied;`
export async function requireRoleRoute(min: "viewer" | "editor"): Promise<NextResponse | null> {
  const parsed = parseAuthCookie((await cookies()).get(AUTH_COOKIE_NAME)?.value);
  const expected = parsed ? expectedPasscodeFor(parsed.role) : undefined;
  if (!parsed || !expected || !safeEqual(parsed.passcode, expected)) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }
  if (min === "editor" && parsed.role !== "editor") {
    return NextResponse.json({ error: "You need Edit access to do this." }, { status: 403 });
  }
  return null;
}
