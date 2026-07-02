import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "evo_auth";

export async function POST(request: NextRequest) {
  const { passcode } = await request.json().catch(() => ({ passcode: null }));

  if (!process.env.EVO_PASSCODE) {
    return NextResponse.json(
      { error: "Server is not configured with a passcode." },
      { status: 500 }
    );
  }

  if (typeof passcode !== "string" || passcode !== process.env.EVO_PASSCODE) {
    return NextResponse.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, passcode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
