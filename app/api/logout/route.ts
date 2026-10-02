import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session";

// Public in middleware so it also works with an expired/invalid session
// (nothing to protect: it only clears the caller's own cookie).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
