import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, isPathAllowedForRole, parseAuthCookie } from "@/lib/auth";

// Page-level deterrent only — this does not (and cannot) restrict the
// Supabase REST API itself, which is governed by RLS policies independently
// of anything in this app. See PROJECT decision: acceptable for v1. The
// Viewer role's Add/Delete restriction is enforced the same way (hidden in
// the UI, not via RLS) — see lib/roleContext.tsx call sites.
export function middleware(request: NextRequest) {
  const parsed = parseAuthCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const expected = parsed ? expectedPasscodeFor(parsed.role) : undefined;

  if (parsed && expected && parsed.passcode === expected) {
    if (!isPathAllowedForRole(request.nextUrl.pathname, parsed.role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Hand the role to Server Components (app/layout.tsx reads this via
    // next/headers) so the UI can gate Add/Delete controls without every
    // page re-deriving it from the cookie itself.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-evo-role", parsed.role);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // API routes are hit via fetch(), not browser navigation — a redirect to
  // /login would be silently followed and come back as a 200 text/html
  // response (the login page), which callers like ExportForm only check
  // via res.ok and would then download as a corrupt "PDF"/"DOCX". Return a
  // JSON 401 instead so those callers can detect and surface the failure.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|api/calendar-feed|_next/static|_next/image|favicon.ico).*)"],
};
