import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, parseAuthCookie } from "@/lib/auth";
import { getRecentActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const parsed = parseAuthCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const expected = parsed ? expectedPasscodeFor(parsed.role) : undefined;
  if (!parsed || !expected || parsed.passcode !== expected) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401, headers: NO_STORE });
  }

  const raw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.max(1, Math.floor(raw))) : 30;

  try {
    const items = await getRecentActivity(parsed.role, limit);
    return NextResponse.json({ items, serverTime: new Date().toISOString() }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/activity failed:", err);
    return NextResponse.json(
      { error: "Couldn't load recent activity." },
      { status: 500, headers: NO_STORE }
    );
  }
}
