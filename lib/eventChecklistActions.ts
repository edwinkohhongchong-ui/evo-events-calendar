"use server";

import { supabase } from "./supabase";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";
import { expandTemplateItems } from "./eventChecklist";
import { OWNER_MIGRATION_HINT, buildOwnerOptions, isMissingOwnerColumn, parseOwner } from "./owner";
import { ChecklistTemplateWithItems, EventChecklistItemRow } from "./types";

const MIGRATION_HINT = "Event checklists need the latest database update (migration 024). Ask Edwin to run it.";

function friendly(error: { code?: string; message?: string }, fallback: string): Error {
  console.error(error);
  // 42P01 = relation missing, 42703 = column missing: migration 024 not run yet.
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST205") {
    return new Error(MIGRATION_HINT);
  }
  return new Error(fallback);
}

// Everything on an event's checklist, in order.
async function getEventChecklistImpl(eventId: string): Promise<EventChecklistItemRow[]> {
  await requireRole("viewer");
  const { data, error } = await supabase
    .from("event_checklist_items")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("created_at");
  // Before migration 024 the table doesn't exist: show an empty checklist, not an error.
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw friendly(error, "Couldn't load this checklist. Please try again.");
  }
  return (data ?? []) as EventChecklistItemRow[];
}

// Name + id of every template, for the "Add checklist" picker.
async function getChecklistTemplateOptionsImpl(): Promise<ChecklistTemplateWithItems[]> {
  await requireRole("editor");
  const [{ data: templates, error: tErr }, { data: items, error: iErr }] = await Promise.all([
    supabase.from("checklist_templates").select("id, name").order("name"),
    supabase.from("checklist_template_items").select("*").order("sort_order"),
  ]);
  if (tErr || iErr) throw friendly((tErr ?? iErr)!, "Couldn't load checklist templates. Please try again.");
  return (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    items: (items ?? [])
      .filter((i) => i.template_id === t.id)
      .map((i) => ({
        id: i.id,
        item: i.item,
        repeat_count: i.repeat_count,
        weeks_before: i.weeks_before ?? null,
      })),
  }));
}

// Copies a template's items onto one event. Safe to run again: only items the
// event doesn't already have (same text) are added, so it doubles as
// "re-add missing items" after the template changed. Editors only; one-off
// events only (a repeating series would otherwise get a fresh list per week).
async function applyChecklistTemplateImpl(eventId: string, templateId: string): Promise<number> {
  await requireRole("editor");
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (eventErr || !event) throw new Error("That event couldn't be found.");
  if (event.recurring !== "None") {
    throw new Error("Checklists aren't available on repeating events yet.");
  }
  // New items start with the event's owner (only present after migration 025).
  const defaultOwner = parseOwner(event.owner);

  const options = await getChecklistTemplateOptionsImpl();
  const template = options.find((t) => t.id === templateId);
  if (!template) throw new Error("That checklist template couldn't be found.");

  const { data: existing, error: existingErr } = await supabase
    .from("event_checklist_items")
    .select("item, sort_order")
    .eq("event_id", eventId);
  if (existingErr) throw friendly(existingErr, "Couldn't add the checklist. Please try again.");
  const have = new Set((existing ?? []).map((r) => r.item));
  const start = (existing ?? []).reduce((m, r) => Math.max(m, r.sort_order + 1), 0);

  const rows = expandTemplateItems(template)
    .filter((it) => !have.has(it.item))
    .map((it, i) => ({
      event_id: eventId,
      item: it.item,
      weeks_before: it.weeks_before,
      source_template: template.name,
      sort_order: start + i,
      ...(defaultOwner ? { owner: defaultOwner } : {}),
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase.from("event_checklist_items").insert(rows);
  if (error) throw friendly(error, "Couldn't add the checklist. Please try again.");
  await logActivity({
    action: "edited",
    entity: "event",
    entityId: eventId,
    label: `${event.name} (checklist)`,
    itemDate: event.event_date,
  });
  return rows.length;
}

// Tick or untick one item. Editors only (Viewers are read-only plus
// sidebar comments). Not individually logged to the bell: a tick
// is high-volume and reversible by unticking.
async function setChecklistItemDoneImpl(itemId: string, done: boolean, doneBy: string | null): Promise<void> {
  await requireRole("editor");
  const { error } = await supabase
    .from("event_checklist_items")
    .update({
      done,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? (doneBy ?? "").trim().slice(0, 60) || null : null,
    })
    .eq("id", itemId);
  if (error) throw friendly(error, "Couldn't update that item. Please try again.");
}

async function removeEventChecklistImpl(eventId: string): Promise<void> {
  await requireRole("editor");
  const { data: event } = await supabase.from("events").select("name, event_date").eq("id", eventId).single();
  const { error } = await supabase.from("event_checklist_items").delete().eq("event_id", eventId);
  if (error) throw friendly(error, "Couldn't remove the checklist. Please try again.");
  if (event) {
    await logActivity({
      action: "edited",
      entity: "event",
      entityId: eventId,
      label: `${event.name} (checklist removed)`,
      itemDate: event.event_date,
    });
  }
}

// Add one custom item to an event's checklist (no template needed). Editors only.
async function addChecklistItemImpl(
  eventId: string,
  text: string,
  weeksBefore?: number | null,
  owner?: string | null
): Promise<void> {
  await requireRole("editor");
  const item = (text ?? "").trim().slice(0, 200);
  if (!item) throw new Error("Type what needs doing.");
  const itemOwner = parseOwner(owner);
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, name, recurring, event_date")
    .eq("id", eventId)
    .single();
  if (eventErr || !event) throw new Error("That event couldn't be found.");
  if (event.recurring !== "None") throw new Error("Checklists aren't available on repeating events yet.");
  const { data: last } = await supabase
    .from("event_checklist_items")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const next = (last?.[0]?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("event_checklist_items").insert({
    event_id: eventId,
    item,
    weeks_before: weeksBefore ?? null,
    sort_order: next,
    // Only sent when set, so adding items still works before migration 025.
    ...(itemOwner ? { owner: itemOwner } : {}),
  });
  if (error && itemOwner && isMissingOwnerColumn(error)) throw new Error(OWNER_MIGRATION_HINT);
  if (error) throw friendly(error, "Couldn't add that item. Please try again.");
  await logActivity({
    action: "edited",
    entity: "event",
    entityId: eventId,
    label: `${event.name} (checklist)`,
    itemDate: event.event_date,
  });
}

// Change (or clear, with a blank name) who owns one checklist item. Editors only.
async function setChecklistItemOwnerImpl(itemId: string, owner: string | null): Promise<void> {
  await requireRole("editor");
  const value = parseOwner(owner);
  const { error } = await supabase.from("event_checklist_items").update({ owner: value }).eq("id", itemId);
  if (error && isMissingOwnerColumn(error)) throw new Error(OWNER_MIGRATION_HINT);
  if (error) throw friendly(error, "Couldn't update that item. Please try again.");
}

// Owner names already used on events and checklist items, for the datalist.
// Empty (not an error) before migration 025.
async function getOwnerOptionsImpl(): Promise<string[]> {
  await requireRole("editor");
  const [events, items] = await Promise.all([
    supabase.from("events").select("owner").not("owner", "is", null),
    supabase.from("event_checklist_items").select("owner").not("owner", "is", null),
  ]);
  for (const { error } of [events, items]) {
    if (error) {
      if (isMissingOwnerColumn(error) || error.code === "42P01") return [];
      throw friendly(error, "Couldn't load owner names.");
    }
  }
  const rows = [...(events.data ?? []), ...(items.data ?? [])] as { owner: string | null }[];
  return buildOwnerOptions(rows.map((r) => r.owner));
}

// Remove a single item from an event's checklist. Editors only.
async function removeChecklistItemImpl(itemId: string): Promise<void> {
  await requireRole("editor");
  const { error } = await supabase.from("event_checklist_items").delete().eq("id", itemId);
  if (error) throw friendly(error, "Couldn't remove that item. Please try again.");
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function getEventChecklist(...args: Parameters<typeof getEventChecklistImpl>) {
  return runAction(() => getEventChecklistImpl(...args));
}
export async function getChecklistTemplateOptions(...args: Parameters<typeof getChecklistTemplateOptionsImpl>) {
  return runAction(() => getChecklistTemplateOptionsImpl(...args));
}
export async function applyChecklistTemplate(...args: Parameters<typeof applyChecklistTemplateImpl>) {
  return runAction(() => applyChecklistTemplateImpl(...args));
}
export async function setChecklistItemDone(...args: Parameters<typeof setChecklistItemDoneImpl>) {
  return runAction(() => setChecklistItemDoneImpl(...args));
}
export async function removeEventChecklist(...args: Parameters<typeof removeEventChecklistImpl>) {
  return runAction(() => removeEventChecklistImpl(...args));
}
export async function addChecklistItem(...args: Parameters<typeof addChecklistItemImpl>) {
  return runAction(() => addChecklistItemImpl(...args));
}
export async function setChecklistItemOwner(...args: Parameters<typeof setChecklistItemOwnerImpl>) {
  return runAction(() => setChecklistItemOwnerImpl(...args));
}
export async function getOwnerOptions(...args: Parameters<typeof getOwnerOptionsImpl>) {
  return runAction(() => getOwnerOptionsImpl(...args));
}
export async function removeChecklistItem(...args: Parameters<typeof removeChecklistItemImpl>) {
  return runAction(() => removeChecklistItemImpl(...args));
}
