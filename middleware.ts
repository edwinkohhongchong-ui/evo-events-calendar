import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "evo_auth";

// Page-level deterrent only — this does not (and cannot) restrict the
// Supabase REST API itself, which is governed by RLS policies independently
// of anything in this app. See PROJECT decision: acceptable for v1.
export function middleware(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  if (cookie && process.env.EVO_PASSCODE && cookie === process.env.EVO_PASSCODE) {
    return NextResponse.next();
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
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
