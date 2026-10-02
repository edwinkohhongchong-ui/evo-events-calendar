import { NextRequest, NextResponse } from "next/server";
import { isPathAllowedForRole } from "@/lib/auth";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Page-level deterrent only — this does not (and cannot) restrict the
// Supabase REST API itself, which is governed by RLS policies independently
// of anything in this app. See PROJECT decision: acceptable for v1. The
// Viewer role's Add/Delete restriction is enforced the same way (hidden in
// the UI, not via RLS) — see lib/roleContext.tsx call sites.
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/logout", "/api/calendar-feed"];

export async function middleware(request: NextRequest) {
  // Public routes skip auth, but still never trust a client-supplied role
  // header (app/layout.tsx reads x-evo-role on /login too).
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-evo-role");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (role) {
    if (!isPathAllowedForRole(request.nextUrl.pathname, role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Hand the role to Server Components (app/layout.tsx reads this via
    // next/headers) so the UI can gate Add/Delete controls without every
    // page re-deriving it from the cookie itself.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-evo-role");
    requestHeaders.set("x-evo-role", role);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
