export type Role = "editor" | "viewer";

export function expectedPasscodeFor(role: Role): string | undefined {
  return role === "editor" ? process.env.EVO_PASSCODE_EDITOR : process.env.EVO_PASSCODE_VIEWER;
}

// A Viewer may reach: "/" and "/day/*" (the Calendar), the "/api/activity"
// feed for the notification bell, and the read-only Export feature (pages
// under "/export" plus the two API routes they call). Every other route
// (Holidays, Seasons, Checklist, Categories, Reminders, Admin) redirects home.
// Editors are unrestricted. Prefix checks are exact-or-slash so "/exportx"
// does not match.
const VIEWER_EXACT_OR_UNDER = ["/export", "/api/export/ics", "/api/export/document"];

export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  if (role === "editor") return true;
  return (
    pathname === "/" ||
    pathname.startsWith("/day/") ||
    pathname === "/api/activity" ||
    VIEWER_EXACT_OR_UNDER.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}
