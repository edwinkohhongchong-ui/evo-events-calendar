export type Role = "editor" | "viewer";

export function expectedPasscodeFor(role: Role): string | undefined {
  return role === "editor" ? process.env.EVO_PASSCODE_EDITOR : process.env.EVO_PASSCODE_VIEWER;
}

// A Viewer may reach: "/" and "/day/*" (the Calendar), the "/api/activity"
// feed for the notification bell, and the read-only Export feature: exactly
// the pages and API routes listed below. Every other route (Holidays, Seasons,
// Checklist, Categories, Reminders, Admin) redirects home. Editors are
// unrestricted. The Export list is EXACT (no prefix) so a future page such as
// "/export/admin" is Editor-only until it is deliberately added here;
// viewerPolicy.test.ts fails if a page under app/export is not listed.
export const VIEWER_EXPORT_PATHS = [
  "/export",
  "/export/calendar",
  "/export/print",
  "/api/export/ics",
  "/api/export/document",
];

export function isPathAllowedForRole(pathname: string, role: Role): boolean {
  if (role === "editor") return true;
  // Next redirects a single trailing slash away; treat it the same here.
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (
    path === "/" ||
    path.startsWith("/day/") ||
    path === "/api/activity" ||
    VIEWER_EXPORT_PATHS.includes(path)
  );
}
