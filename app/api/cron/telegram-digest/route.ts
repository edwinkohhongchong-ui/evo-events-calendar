import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safeEqual";
import { buildDigestMessages } from "@/lib/telegramDigestData";
import { readTelegramEnv, sendTelegramMessages } from "@/lib/telegramSend";

export const dynamic = "force-dynamic";

// A short secret could be guessed online (the path is public in middleware).
const MIN_SECRET_LENGTH = 32;

// Sunday Telegram message, called by Vercel Cron (vercel.json: "30 11 * * 0"
// = Sunday 19:30 Singapore). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// middleware.ts lets /api/cron/ through WITHOUT a session cookie, so this
// bearer check is the only gate: it comes first and fails closed.
//
// Vercel's Hobby plan only guarantees a once-a-day cron "within the hour", so
// the message may arrive anywhere between 19:00 and 19:59 SGT; an exact 19:30
// needs Pro. There is no stateless way to stop a double trigger in the same
// hour from sending twice, so none is attempted.
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

  try {
    const messages = await buildDigestMessages(new Date(), process.env.APP_URL);
    const sent = await sendTelegramMessages(telegram.env, messages);
    return NextResponse.json({ status: "sent", messages: sent });
  } catch (err) {
    console.error("telegram digest failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "The digest could not be sent." }, { status: 500 });
  }
}
