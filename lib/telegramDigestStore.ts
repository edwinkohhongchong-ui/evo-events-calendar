import { supabase } from "./supabase";
import { STALE_CLAIM_MS, isMissingDigestTable, type DigestConfig } from "./telegramDigestConfig";
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

/** Migration 030 columns missing: 42703 = Postgres, PGRST204 = PostgREST schema cache. */
function isMissingStatusColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /last_(status|attempt_at|error)/i.test(error.message ?? "");
}

/** The row came from a database that has migration 030 (select("*") returns the columns, null or not). */
const hasStatusColumns = (row: TelegramDigestRow) => "last_status" in row;

export type RunStatus = "sent" | "skipped" | "failed";

/**
 * Takes today's send for a digest with ONE conditional update, so two
 * overlapping triggers cannot both win. Returns false when it was already
 * taken. A pending "skip next" is cleared in the same statement.
 *
 * With migration 030 the claim also stamps last_attempt_at and clears
 * last_status, and a claim that was never confirmed (last_status still null
 * and the attempt older than 10 minutes, or last_status "failed") can be taken
 * again: that is how the second daily cron run recovers from a crash between
 * claiming and sending. If those columns are missing it falls back to the
 * original once-a-day claim. Caveat, accepted: a partial multi-chunk send that
 * dies before confirming repeats its first chunk(s) on the retry.
 */
export async function claimDigest(row: TelegramDigestRow, today: string, now: Date = new Date()): Promise<boolean> {
  const patch: Record<string, unknown> = { last_sent_on: today };
  if (row.skip_next) {
    patch.skip_next = false;
    patch.updated_at = now.toISOString(); // an open editor must not overwrite this
  }
  const plain = () =>
    supabase.from("telegram_digests").update(patch).eq("id", row.id).or(`last_sent_on.is.null,last_sent_on.neq.${today}`).select("id");

  let result;
  if (hasStatusColumns(row)) {
    const cutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    result = await supabase
      .from("telegram_digests")
      .update({
        ...patch,
        last_attempt_at: now.toISOString(),
        // A skip is recorded in the claim itself: if a later status write fails,
        // the retry run must not mistake it for a crashed claim and send anyway.
        last_status: row.skip_next ? "skipped" : null,
        last_error: null,
      })
      .eq("id", row.id)
      .or(
        `last_sent_on.is.null,last_sent_on.neq.${today},` +
          `and(last_sent_on.eq.${today},last_status.eq.failed),` +
          `and(last_sent_on.eq.${today},last_status.is.null,last_attempt_at.lt.${cutoff})`
      )
      .select("id");
    if (isMissingStatusColumn(result.error)) result = await plain();
  } else {
    result = await plain();
  }
  if (result.error) {
    console.error("telegram digests: claim failed:", result.error.message);
    throw new Error(FAILED);
  }
  return (result.data ?? []).length > 0;
}

/**
 * Best effort: records how the last run went. Never throws and never blocks a
 * send; silently does nothing before migration 030. `error` must be one of the
 * fixed strings in the cron route, never driver or Telegram text.
 */
export async function recordRunStatus(row: TelegramDigestRow, status: RunStatus, error: string | null = null): Promise<void> {
  if (!hasStatusColumns(row)) return;
  // One retry: a "sent" that fails to record would look like a crashed claim
  // to the second run and post the digest twice.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error: dbError } = await supabase
      .from("telegram_digests")
      .update({ last_status: status, last_error: error, last_attempt_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!dbError) return;
    if (isMissingStatusColumn(dbError)) return;
    if (attempt === 1) console.error("telegram digests: recording the run status failed:", dbError.message);
  }
}

/**
 * Puts last_sent_on back after a failed send so the next trigger can retry,
 * and notes the failure (best effort) so the Reminders page can show it.
 */
export async function releaseClaim(row: TelegramDigestRow, today: string, reason: string | null = null): Promise<void> {
  const { error } = await supabase
    .from("telegram_digests")
    .update({ last_sent_on: row.last_sent_on })
    .eq("id", row.id)
    .eq("last_sent_on", today);
  if (error) console.error("telegram digests: releasing the claim failed:", error.message);
  await recordRunStatus(row, "failed", reason);
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
  else await recordRunStatus(row, "sent");
}
