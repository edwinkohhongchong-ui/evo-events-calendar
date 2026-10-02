import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

// Route-handler counterpart of lib/authz.ts#requireRole. Middleware already
// enforces this for /api/*; calling it first in a handler is defence in depth.
// Usage: `const denied = await requireRoleRoute("editor"); if (denied) return denied;`
export async function requireRoleRoute(min: "viewer" | "editor"): Promise<NextResponse | null> {
  const role = await verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!role) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }
  if (min === "editor" && role !== "editor") {
    return NextResponse.json({ error: "You need Edit access to do this." }, { status: 403 });
  }
  return null;
}
