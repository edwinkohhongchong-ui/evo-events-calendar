export type Role = "editor" | "viewer";

export function expectedPasscodeFor(role: Role): string | undefined {
  return role === "editor" ? process.env.EVO_PASSCODE_EDITOR : process.env.EVO_PASSCODE_VIEWER;
}

// Only "/" and "/day/*" (the Calendar tab, per the viewer role's scope) plus
// the "/api/activity" feed for the notification bell are reachable by a
// Viewer — every other route (Holidays, Seasons, Checklist,
// Categories, Reminders, Export) redirects home. Editors are unrestricted.
export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  if (role === "editor") return true;
  return pathname === "/" || pathname.startsWith("/day/") || pathname === "/api/activity";
}
