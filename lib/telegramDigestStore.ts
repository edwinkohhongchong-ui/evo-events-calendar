import { supabase } from "./supabase";
import { isMissingDigestTable, type DigestConfig } from "./telegramDigestConfig";
import type { TelegramDigestRow } from "./types";

// Reads and writes the telegram_digests table (migration 029). Not a "use
// server" file and no role check of its own: the Reminders-page actions call
// requireRole first, and the cron route is gated by its bearer secret.

const FAILED = "Could not read the digests. Please try again.";

/** `ready: false` means the table does not exist yet (migration 029 not run). */
export type DigestList = { ready: true; rows: TelegramDigestRow[] } | { ready: false; rows: [] };

/** Strict read: any failure other than a missing table throws, so callers never guess. */
export async function readAllDigests(): Promise<DigestList> {
  const { data, error } = await supabase.from("telegram_digests").select("*").order("created_at").order("id");
  if (error) {
    if (isMissingDigestTable(error)) return { ready: false, rows: [] };
    console.error("telegram digests: read failed:", error.message);
    throw new Error(FAILED);
  }
  return { ready: true, rows: (data ?? []) as TelegramDigestRow[] };
}

export async function readDigest(id: string): Promise<TelegramDigestRow | null> {
  const { data, error } = await supabase.from("telegram_digests").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingDigestTable(error)) return null;
    console.error("telegram digests: read failed:", error.message);
    throw new Error(FAILED);
  }
  return (data as TelegramDigestRow | null) ?? null;
}

/**
 * Takes today's send for a digest with ONE conditional update, so two
 * overlapping triggers cannot both win. Returns false when it was already
 * taken. A pending "skip next" is cleared in the same statement.
 */
export async function claimDigest(row: TelegramDigestRow, today: string): Promise<boolean> {
  const patch: Record<string, unknown> = { last_sent_on: today };
  if (row.skip_next) {
    patch.skip_next = false;
    patch.updated_at = new Date().toISOString(); // an open editor must not overwrite this
  }
  const { data, error } = await supabase
    .from("telegram_digests")
    .update(patch)
    .eq("id", row.id)
    .or(`last_sent_on.is.null,last_sent_on.neq.${today}`)
    .select("id");
  if (error) {
    console.error("telegram digests: claim failed:", error.message);
    throw new Error(FAILED);
  }
  return (data ?? []).length > 0;
}

/** Puts last_sent_on back after a failed send so the next trigger can retry. */
export async function releaseClaim(row: TelegramDigestRow, today: string): Promise<void> {
  const { error } = await supabase
    .from("telegram_digests")
    .update({ last_sent_on: row.last_sent_on })
    .eq("id", row.id)
    .eq("last_sent_on", today);
  if (error) console.error("telegram digests: releasing the claim failed:", error.message);
}

/** After a successful send: the edited message was for one send only. Best effort. */
export async function consumeOverride(row: TelegramDigestRow): Promise<void> {
  if (!row.override_text) return;
  const { error } = await supabase
    .from("telegram_digests")
    .update({ override_text: null, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("override_text", row.override_text); // not if someone edited it meanwhile
  if (error) console.error("telegram digests: clearing the edited message failed:", error.message);
}

export type SaveOutcome = { ok: true; row: TelegramDigestRow } | { ok: false; reason: "missing-table" | "conflict" };

/** Creates (no id) or updates a digest. With `expectedUpdatedAt`, an update only lands on an unchanged row. */
export async function writeDigest(config: DigestConfig, id?: string, expectedUpdatedAt?: string): Promise<SaveOutcome> {
  if (!id) {
    const { data, error } = await supabase.from("telegram_digests").insert(config).select().single();
    if (error) {
      if (isMissingDigestTable(error)) return { ok: false, reason: "missing-table" };
      console.error("telegram digests: create failed:", error.message);
      throw new Error("Could not save the digest. Please try again.");
    }
    return { ok: true, row: data as TelegramDigestRow };
  }
  let query = supabase
    .from("telegram_digests")
    .update({ ...config, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select();
  if (error) {
    if (isMissingDigestTable(error)) return { ok: false, reason: "missing-table" };
    console.error("telegram digests: update failed:", error.message);
    throw new Error("Could not save the digest. Please try again.");
  }
  if (!data || data.length === 0) return { ok: false, reason: "conflict" };
  return { ok: true, row: data[0] as TelegramDigestRow };
}

/** Returns false when the table is missing. */
export async function removeDigest(id: string): Promise<boolean> {
  const { error } = await supabase.from("telegram_digests").delete().eq("id", id);
  if (error) {
    if (isMissingDigestTable(error)) return false;
    console.error("telegram digests: delete failed:", error.message);
    throw new Error("Could not delete the digest. Please try again.");
  }
  return true;
}

/** Marks a manual "send now" as today's send and uses up an edited message. Best effort. */
export async function markSentNow(row: TelegramDigestRow, today: string): Promise<void> {
  const patch: Record<string, unknown> = { last_sent_on: today };
  if (row.override_text) {
    patch.override_text = null;
    patch.updated_at = new Date().toISOString();
  }
  const { error } = await supabase.from("telegram_digests").update(patch).eq("id", row.id);
  if (error) console.error("telegram digests: recording the send failed:", error.message);
}
