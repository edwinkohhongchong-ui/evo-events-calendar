import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, Role, serializeAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
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
  if (typeof passcode !== "string" || passcode !== expected) {
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
