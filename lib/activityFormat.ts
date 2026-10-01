import { ActivityAction, ActivityEntity } from "./types";

// Pure helpers for the activity feed (no server/DB imports so they can be
// unit-tested and safely imported anywhere).

export const MAX_LABEL = 40;

export function truncateLabel(label: string, max = MAX_LABEL): string {
  const clean = label.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

type FocusKind = "event" | "holiday" | "season" | "day" | "notes";

function calendarHref(itemDate: string | null | undefined, focus: string | null): string {
  const m = itemDate ? /^(\d{4})-(\d{2})-\d{2}/.exec(itemDate) : null;
  const params: string[] = [];
  if (m) {
    params.push(`year=${Number(m[1])}`, `month=${Number(m[2])}`);
  }
  if (focus) params.push(`focus=${focus}`);
  return params.length ? `/?${params.join("&")}` : "/";
}

function focusFor(kind: FocusKind, key: string | null | undefined): string | null {
  if (kind === "notes") return "notes";
  return key ? `${kind}:${encodeURIComponent(key)}` : null;
}

export function activityHref(
  entity: ActivityEntity,
  entityId: string | null | undefined,
  itemDate: string | null | undefined
): string | null {
  switch (entity) {
    case "event":
      return calendarHref(itemDate, focusFor("event", entityId));
    case "season":
      return calendarHref(itemDate, focusFor("season", entityId));
    case "holiday":
      return calendarHref(itemDate, focusFor("holiday", itemDate));
    case "day_note":
      return calendarHref(itemDate, focusFor("day", itemDate));
    case "note":
    case "comment":
      return calendarHref(itemDate, focusFor("notes", null));
    case "category":
      return "/levels";
    case "checklist":
      return "/checklist";
    case "undo":
      return null;
  }
}

const ENTITY_WORD: Record<ActivityEntity, string> = {
  event: "event",
  holiday: "holiday",
  season: "season",
  category: "category",
  checklist: "checklist item",
  note: "note",
  comment: "comment",
  day_note: "day note",
  undo: "change",
};

export function summaryFor(
  actorRole: "editor" | "viewer",
  action: ActivityAction,
  entity: ActivityEntity,
  label: string
): string {
  const who = actorRole === "editor" ? "Editor" : "Viewer";
  const name = truncateLabel(label);
  switch (action) {
    case "undid":
      return `${who} undid a change`;
    case "redid":
      return `${who} redid a change`;
    case "moved":
      return `${who} moved “${name}”`;
    case "commented":
      return `${who} commented on ${name}`;
    case "deleted":
      if (entity === "note" || entity === "comment") return `${who} deleted a comment on ${name}`;
      return `${who} deleted ${ENTITY_WORD[entity]} “${name}”`;
    default:
      return `${who} ${action} ${ENTITY_WORD[entity]} “${name}”`;
  }
}

// Everything a Viewer may see: things visible on the calendar page, which is
// the only page a Viewer can open (see isPathAllowedForRole).
export const VIEWER_ENTITIES: ActivityEntity[] = ["event", "holiday", "season", "note", "comment", "day_note"];

export function canRoleSeeEntity(role: "editor" | "viewer", entity: ActivityEntity): boolean {
  return role === "editor" || VIEWER_ENTITIES.includes(entity);
}

// Viewers can only open calendar URLs; anything else is nulled so the bell
// never offers a link that would just bounce them home.
export function hrefForRole(href: string | null, role: "editor" | "viewer"): string | null {
  if (role === "editor" || href === null) return href;
  return href === "/" || href.startsWith("/?") ? href : null;
}
