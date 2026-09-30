export type Role = "editor" | "viewer";

export const AUTH_COOKIE_NAME = "evo_auth";

// The cookie stores "role:passcode" rather than a plain boolean/role flag —
// re-checking the passcode portion against the matching env var on every
// request (see middleware.ts) is what makes this a real (if deterrent-only,
// same as the original single-passcode gate) check, not just a client-set
// flag someone could forge by editing their own cookie to "role=editor".
export function parseAuthCookie(value: string | undefined): { role: Role; passcode: string } | null {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep === -1) return null;
  const role = value.slice(0, sep);
  const passcode = value.slice(sep + 1);
  if (role !== "editor" && role !== "viewer") return null;
  return { role, passcode };
}

export function serializeAuthCookie(role: Role, passcode: string): string {
  return `${role}:${passcode}`;
}

export function expectedPasscodeFor(role: Role): string | undefined {
  return role === "editor" ? process.env.EVO_PASSCODE_EDITOR : process.env.EVO_PASSCODE_VIEWER;
}

// Only "/" and "/day/*" (the Calendar tab, per the viewer role's scope) are
// reachable by a Viewer — every other route (Holidays, Seasons, Checklist,
// Categories, Reminders, Export) redirects home. Editors are unrestricted.
export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  if (role === "editor") return true;
  return pathname === "/" || pathname.startsWith("/day/");
}
