"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

// Server-side backstop for the Editor/Viewer role split. Every mutating
// Server Action in lib/*Actions.ts calls this first — it re-reads the
// httpOnly evo_auth cookie via next/headers (not spoofable by editing
// client-side React state, unlike the useIsEditor() UI gate) and verifies its
// signature, expiry and passcode fingerprint (lib/session.ts), mirroring the
// same check middleware.ts does for page navigation.
export async function requireRole(min: "viewer" | "editor"): Promise<void> {
  const role = await verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!role) {
    throw new Error("Your session has expired. Please log in again.");
  }
  if (min === "editor" && role !== "editor") {
    throw new Error("You need Edit access to do this.");
  }
}
