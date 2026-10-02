"use server";

import { supabase } from "./supabase";
import { HolidayFormValues } from "./types";
import { AffectedRow } from "./undo/types";
import { fetchRow } from "./undo/capture";
import { pickHolidayColumns } from "./pickColumns";
import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { logActivity } from "./activity";

async function createHolidayImpl(values: HolidayFormValues): Promise<AffectedRow[]> {
  await requireRole("editor");
  const { data, error } = await supabase.from("holidays").insert(pickHolidayColumns(values)).select().single();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this holiday. Check your connection and try again. Your details are still in the form.");
  }
  await logActivity({ action: "added", entity: "holiday", entityId: data.id, label: values.name, itemDate: values.holiday_date });
  return [{ table: "holidays", id: data.id, before: null, after: data }];
}

// `expectedUpdatedAt` (optional, backward-compatible) is an optimistic-lock
// check: pass the `updated_at` the caller loaded the row with, and the
// update only applies if nobody else has changed it since. Omitting it
// (every existing call site currently does) skips the check entirely, same
// as before this change.
//
// NOTE — known limitation: no component call site actually passes this yet.
// Wiring it through requires the row's `updated_at` to flow from
// lib/types.ts's HolidayFormValues/HolidayRow types and from the component
// that loads the row into the edit form — both out of scope here (this
// pass's file boundary excludes lib/types.ts and all component files). This
// is real, working concurrent-edit detection at the data-access layer, but
// it is not yet wired up end-to-end; a follow-up in the component layer is
// needed to actually get the protection in the running app.
async function updateHolidayImpl(
  id: string,
  values: HolidayFormValues,
  expectedUpdatedAt?: string
): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("holidays", id);
  let query = supabase.from("holidays").update(pickHolidayColumns(values)).eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    console.error(error);
    throw new Error("Something went wrong saving this holiday. Check your connection and try again. Your details are still in the form.");
  }
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Someone else changed this since you loaded it — please refresh and try again."
        : "Holiday not found."
    );
  }
  await logActivity({ action: "edited", entity: "holiday", entityId: id, label: values.name, itemDate: values.holiday_date });
  return [{ table: "holidays", id, before, after: data[0] }];
}

async function deleteHolidayImpl(id: string): Promise<AffectedRow[]> {
  await requireRole("editor");
  const before = await fetchRow("holidays", id);
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) {
    console.error(error);
    throw new Error("Something went wrong deleting this holiday. Please try again.");
  }
  if (!before) return [];
  await logActivity({ action: "deleted", entity: "holiday", entityId: id, label: String(before.name), itemDate: before.holiday_date });
  return [{ table: "holidays", id, before, after: null }];
}

// Public Server Actions: every one returns an ActionResult (see lib/actionResult.ts).
export async function createHoliday(...args: Parameters<typeof createHolidayImpl>) {
  return runAction(() => createHolidayImpl(...args));
}

export async function updateHoliday(...args: Parameters<typeof updateHolidayImpl>) {
  return runAction(() => updateHolidayImpl(...args));
}

export async function deleteHoliday(...args: Parameters<typeof deleteHolidayImpl>) {
  return runAction(() => deleteHolidayImpl(...args));
}
