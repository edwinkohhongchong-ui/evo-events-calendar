"use server";

import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { sgDateStr } from "./dates";
import {
  DIGEST_MIGRATION_HINT,
  configOf,
  normaliseDigestConfig,
  type DigestConfig,
} from "./telegramDigestConfig";
import { buildDigestMessages } from "./telegramDigestData";
import { markSentNow, readAllDigests, readDigest, removeDigest, writeDigest } from "./telegramDigestStore";
import { readTelegramEnv, sendTelegramMessages } from "./telegramSend";

// Editor-only management of the configurable Telegram digests on the
// Reminders page. The scheduled send itself is
// app/api/cron/telegram-digest/route.ts. Nothing here sends except
// sendTelegramDigestNow, and the previews only return text.

const NOT_CONFIGURED = "Telegram isn't set up yet. Add the bot token and group chat id in Vercel (see ONBOARDING.md), then redeploy.";
const GONE = "That digest no longer exists. Please reload the page.";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// A draft being edited may not have a name yet; a preview doesn't need one.
function previewConfig(draft: unknown): DigestConfig {
  const named = isRecord(draft) ? { ...draft, name: typeof draft.name === "string" && draft.name.trim() ? draft.name : "Preview" } : draft;
  return { ...normaliseDigestConfig(named), override_text: null };
}

async function listTelegramDigestsImpl() {
  await requireRole("editor");
  return readAllDigests();
}

async function saveTelegramDigestImpl(input: { id?: string; expectedUpdatedAt?: string; config: unknown }) {
  await requireRole("editor");
  if (!isRecord(input)) throw new Error("Some of the digest settings are not valid.");
  const config = normaliseDigestConfig(input.config);
  const id = typeof input.id === "string" && input.id ? input.id : undefined;
  const expected = typeof input.expectedUpdatedAt === "string" && input.expectedUpdatedAt ? input.expectedUpdatedAt : undefined;
  const outcome = await writeDigest(config, id, expected);
  if (!outcome.ok) {
    if (outcome.reason === "missing-table") throw new Error(DIGEST_MIGRATION_HINT);
    throw new Error("This digest was changed or deleted by someone else. Please close it and open it again.");
  }
  return { row: outcome.row };
}

async function deleteTelegramDigestImpl(id: string) {
  await requireRole("editor");
  if (typeof id !== "string" || !id) throw new Error(GONE);
  if (!(await removeDigest(id))) throw new Error(DIGEST_MIGRATION_HINT);
  return { deleted: true };
}

// The automatic wording for a draft that isn't saved yet (live preview).
async function previewTelegramDigestForImpl(draft: unknown): Promise<{ messages: string[] }> {
  await requireRole("editor");
  return { messages: await buildDigestMessages(new Date(), process.env.APP_URL, previewConfig(draft)) };
}

// The automatic text as one editable block, to start an edited message from.
async function generateOverrideTextImpl(input: { id?: string; draft?: unknown }): Promise<{ text: string }> {
  await requireRole("editor");
  let config: DigestConfig;
  if (isRecord(input) && input.draft !== undefined) {
    config = previewConfig(input.draft);
  } else {
    const row = isRecord(input) && typeof input.id === "string" ? await readDigest(input.id) : null;
    if (!row) throw new Error(GONE);
    config = { ...configOf(row), override_text: null };
  }
  return { text: (await buildDigestMessages(new Date(), process.env.APP_URL, config)).join("\n") };
}

// Posts one saved digest to the group right now, whatever its days or on/off
// state, and counts it as today's send so the schedule doesn't repeat it.
async function sendTelegramDigestNowImpl(id: string): Promise<{ sent: number }> {
  await requireRole("editor");
  const telegram = readTelegramEnv();
  if (!telegram.ok) {
    console.error(`telegram digest: ${telegram.missing} is not set.`);
    throw new Error(NOT_CONFIGURED);
  }
  const row = typeof id === "string" && id ? await readDigest(id) : null;
  if (!row) throw new Error(GONE);
  const messages = await buildDigestMessages(new Date(), process.env.APP_URL, configOf(row));
  const sent = await sendTelegramMessages(telegram.env, messages);
  await markSentNow(row, sgDateStr(new Date()));
  return { sent };
}

export async function listTelegramDigests(...args: Parameters<typeof listTelegramDigestsImpl>) {
  return runAction(() => listTelegramDigestsImpl(...args));
}

export async function saveTelegramDigest(...args: Parameters<typeof saveTelegramDigestImpl>) {
  return runAction(() => saveTelegramDigestImpl(...args));
}

export async function deleteTelegramDigest(...args: Parameters<typeof deleteTelegramDigestImpl>) {
  return runAction(() => deleteTelegramDigestImpl(...args));
}

export async function previewTelegramDigestFor(...args: Parameters<typeof previewTelegramDigestForImpl>) {
  return runAction(() => previewTelegramDigestForImpl(...args));
}

export async function generateOverrideText(...args: Parameters<typeof generateOverrideTextImpl>) {
  return runAction(() => generateOverrideTextImpl(...args));
}

export async function sendTelegramDigestNow(...args: Parameters<typeof sendTelegramDigestNowImpl>) {
  return runAction(() => sendTelegramDigestNowImpl(...args));
}
