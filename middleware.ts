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

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
