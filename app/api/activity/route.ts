import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getRecentActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401, headers: NO_STORE });
  }

  const raw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.max(1, Math.floor(raw))) : 30;

  try {
    const items = await getRecentActivity(role, limit);
    return NextResponse.json({ items, serverTime: new Date().toISOString() }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/activity failed:", err);
    return NextResponse.json(
      { error: "Couldn't load recent activity." },
      { status: 500, headers: NO_STORE }
    );
  }
}
