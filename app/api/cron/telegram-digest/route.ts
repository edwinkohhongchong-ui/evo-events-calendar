import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safeEqual";
import { sgDateStr } from "@/lib/dates";
import { configOf, isDueToday, weekdayOf } from "@/lib/telegramDigestConfig";
import { buildDigestMessages } from "@/lib/telegramDigestData";
import { claimDigest, consumeOverride, readAllDigests, recordRunStatus, releaseClaim } from "@/lib/telegramDigestStore";
import { readTelegramEnv, sendTelegramMessages } from "@/lib/telegramSend";

export const dynamic = "force-dynamic";

// A short secret could be guessed online (the path is public in middleware).
const MIN_SECRET_LENGTH = 32;

const READ_FAILED = "Could not read the calendar";
const SEND_FAILED = "Telegram refused the message";

// Telegram digests, called once a day by Vercel Cron (vercel.json:
// "30 11 * * *" = 19:30 Singapore, every day). Vercel sends
// `Authorization: Bearer $CRON_SECRET`. middleware.ts lets /api/cron/ through
// WITHOUT a session cookie, so this bearer check is the only gate: it comes
// first and fails closed.
//
// Which digests go out is decided here, from the telegram_digests table
// (migration 029): every enabled digest whose weekday (Singapore) is today and
// that has not been sent today. Each is claimed with one conditional update
// BEFORE sending, so a double trigger cannot post twice; a failed send
// releases the claim so a retry can. With no table or no rows the built-in
// Sunday message is used, and only on Sundays (the old schedule was Sunday-only).
//
// vercel.json lists the path twice (11:30 and 12:30 UTC = 19:30 and 20:30
// Singapore). The second run is the safety net: the first run claims a digest
// (last_sent_on = today, last_status null) and only marks it "sent" after the
// post, so if that run crashed or timed out in between, the claim is stale
// after 10 minutes and the second run takes it again. A digest already sent
// (or skipped) is left alone. A caught failure releases the claim, so the
// second run retries it too. Before migration 030 there are no status columns
// and each digest is attempted once a day, as before. Accepted: a multi-chunk
// send that dies part-way can repeat its first chunk(s) on the retry.
//
// Vercel's Hobby plan only guarantees each daily cron "within the hour", so
// the messages may arrive anywhere between 19:00 and 19:59 SGT (retry 20:00
// to 20:59); exact times need Pro.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) console.error("telegram digest: CRON_SECRET is not set; refusing every request.");
  else if (secret.length < MIN_SECRET_LENGTH) console.error("telegram digest: CRON_SECRET is too short; refusing every request.");
  if (!secret || secret.length < MIN_SECRET_LENGTH || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.TELEGRAM_DIGEST_ENABLED !== "true") {
    return NextResponse.json({ status: "disabled" });
  }

  const telegram = readTelegramEnv();
  if (!telegram.ok) {
    console.error(`telegram digest: ${telegram.missing} is not set.`);
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const FAILED = { error: "The digest could not be sent." };
  const now = new Date();
  const today = sgDateStr(now);

  let list;
  try {
    list = await readAllDigests();
  } catch (err) {
    console.error("telegram digest failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json(FAILED, { status: 500 });
  }

  // No digests set up yet: the built-in Sunday message, exactly as before.
  if (list.rows.length === 0) {
    if (weekdayOf(today) !== 0) return NextResponse.json({ status: "none due" });
    try {
      const messages = await buildDigestMessages(now, process.env.APP_URL);
      const sent = await sendTelegramMessages(telegram.env, messages);
      return NextResponse.json({ status: "sent", messages: sent });
    } catch (err) {
      console.error("telegram digest failed:", err instanceof Error ? err.message : "unknown error");
      return NextResponse.json(FAILED, { status: 500 });
    }
  }

  let digests = 0;
  let messageCount = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of list.rows.filter((r) => isDueToday(r, today, now.getTime()))) {
    try {
      if (!(await claimDigest(row, today, now))) continue; // another trigger already took today's send
    } catch (err) {
      console.error("telegram digest failed:", err instanceof Error ? err.message : "unknown error");
      failed += 1;
      continue;
    }
    if (row.skip_next) {
      skipped += 1; // the claim stays, so today counts as handled
      await recordRunStatus(row, "skipped");
      continue;
    }
    // Fixed strings only: they are stored and shown on the Reminders page, so
    // they must never carry driver text, the token or the chat id.
    let reason = READ_FAILED;
    try {
      const messages = await buildDigestMessages(now, process.env.APP_URL, configOf(row));
      reason = SEND_FAILED;
      messageCount += await sendTelegramMessages(telegram.env, messages);
      digests += 1;
    } catch (err) {
      console.error("telegram digest failed:", err instanceof Error ? err.message : "unknown error");
      failed += 1;
      await releaseClaim(row, today, reason);
      continue;
    }
    await recordRunStatus(row, "sent");
    await consumeOverride(row);
  }

  if (failed > 0) return NextResponse.json({ ...FAILED, sent: digests, failed }, { status: 500 });
  if (digests === 0 && skipped === 0) return NextResponse.json({ status: "none due" });
  return NextResponse.json({ status: digests > 0 ? "sent" : "skipped", digests, messages: messageCount, skipped });
}
