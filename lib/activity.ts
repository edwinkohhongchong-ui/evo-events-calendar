import { cookies } from "next/headers";
import { supabase } from "./supabase";
import { AUTH_COOKIE_NAME, Role, parseAuthCookie } from "./auth";
import { activityHref, canRoleSeeEntity, hrefForRole, summaryFor, truncateLabel, VIEWER_ENTITIES } from "./activityFormat";
import { ActivityAction, ActivityEntity, ActivityItem } from "./types";

// Deliberately NOT a "use server" file: every export of one would be a
// client-callable action, and logActivity must not be callable from the
// browser (anyone could forge feed entries). Only server code imports this.

const RETAIN_DAYS = 30;
const FEED_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LogActivityInput {
  action: ActivityAction;
  entity: ActivityEntity;
  entityId?: string | null;
  label: string;
  itemDate?: string | null;
}

// Best-effort: call AFTER a mutation succeeded. Never throws — a missing
// table (migration 023 not run) or any other failure must not break the real
// change.
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const parsed = parseAuthCookie((await cookies()).get(AUTH_COOKIE_NAME)?.value);
    if (!parsed) return;
    const itemDate = input.itemDate ?? null;
    const entityId = input.entityId ?? null;
    const { error } = await supabase.from("activity_log").insert({
      actor_role: parsed.role,
      action: input.action,
      entity: input.entity,
      entity_id: entityId,
      label: truncateLabel(input.label, 60),
      item_date: itemDate,
      href: activityHref(input.entity, entityId, itemDate),
    });
    if (error) {
      console.error("activity_log insert failed:", error);
      return;
    }
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - RETAIN_DAYS * DAY_MS).toISOString();
      const { error: pruneError } = await supabase.from("activity_log").delete().lt("created_at", cutoff);
      if (pruneError) console.error("activity_log prune failed:", pruneError);
    }
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

// Role filtering is enforced here, not in the UI.
export async function getRecentActivity(role: Role, limit = 30): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - FEED_DAYS * DAY_MS).toISOString();
  let query = supabase
    .from("activity_log")
    .select("id, created_at, actor_role, action, entity, label, href")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (role === "viewer") query = query.in("entity", VIEWER_ENTITIES);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((r) => canRoleSeeEntity(role, r.entity as ActivityEntity))
    .map((r) => ({
      id: r.id,
      created_at: r.created_at,
      actor_role: r.actor_role,
      action: r.action,
      entity: r.entity,
      label: r.label,
      summary: summaryFor(r.actor_role, r.action, r.entity, r.label),
      href: hrefForRole(r.href, role),
    }));
}
