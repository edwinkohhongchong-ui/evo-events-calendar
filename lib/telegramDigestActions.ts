"use server";

import { requireRole } from "./authz";
import { runAction } from "./actionResult";
import { buildDigestMessages } from "./telegramDigestData";
import { readTelegramEnv, sendTelegramMessages } from "./telegramSend";

// Editor-only buttons on the Reminders page for the automatic Sunday Telegram
// message (the scheduled send itself is app/api/cron/telegram-digest/route.ts).

const NOT_CONFIGURED = "Telegram isn't set up yet. Add the bot token and group chat id in Vercel (see ONBOARDING.md), then redeploy.";

// Builds the message exactly as the schedule would, without sending anything.
async function previewTelegramDigestImpl(): Promise<{ messages: string[] }> {
  await requireRole("editor");
  return { messages: await buildDigestMessages(new Date(), process.env.APP_URL) };
}

// Sends the message to the group right now, regardless of TELEGRAM_DIGEST_ENABLED.
async function sendTelegramDigestTestImpl(): Promise<{ sent: number }> {
  await requireRole("editor");
  const telegram = readTelegramEnv();
  if (!telegram.ok) {
    console.error(`telegram digest: ${telegram.missing} is not set.`);
    throw new Error(NOT_CONFIGURED);
  }
  const messages = await buildDigestMessages(new Date(), process.env.APP_URL);
  return { sent: await sendTelegramMessages(telegram.env, messages) };
}

export async function previewTelegramDigest(...args: Parameters<typeof previewTelegramDigestImpl>) {
  return runAction(() => previewTelegramDigestImpl(...args));
}

export async function sendTelegramDigestTest(...args: Parameters<typeof sendTelegramDigestTestImpl>) {
  return runAction(() => sendTelegramDigestTestImpl(...args));
}
