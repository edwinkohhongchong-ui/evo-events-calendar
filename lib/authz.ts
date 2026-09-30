"use server";

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, expectedPasscodeFor, parseAuthCookie } from "./auth";

// Server-side backstop for the Editor/Viewer role split. Every mutating
// Server Action in lib/*Actions.ts calls this first — it re-reads the
// httpOnly evo_auth cookie via next/headers (not spoofable by editing
// client-side React state, unlike the useIsEditor() UI gate) and re-checks
// the passcode portion against the matching env var, mirroring the same
// check middleware.ts does for page navigation.
export async function requireRole(min: "viewer" | "editor"): Promise<void> {
  const raw = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const parsed = parseAuthCookie(raw);
  const expected = parsed ? expectedPasscodeFor(parsed.role) : undefined;
  if (!parsed || !expected || parsed.passcode !== expected) {
    throw new Error("Your session has expired. Please log in again.");
  }
  if (min === "editor" && parsed.role !== "editor") {
    throw new Error("You need Edit access to do this.");
  }
}
