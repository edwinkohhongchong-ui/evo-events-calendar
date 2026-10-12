// Sends plain-text messages to the one Telegram group chat. Not a "use
// server" file. The bot token only ever appears inside the request URL; it is
// never logged, returned or put in an error message.

export interface TelegramEnv {
  token: string;
  chatId: string;
}

/** The bot token and group chat id, or the name of the first missing variable. */
export function readTelegramEnv(): { ok: true; env: TelegramEnv } | { ok: false; missing: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, missing: "TELEGRAM_BOT_TOKEN" };
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) return { ok: false, missing: "TELEGRAM_CHAT_ID" };
  return { ok: true, env: { token, chatId } };
}

export const TELEGRAM_SEND_FAILED = "Telegram did not accept the message. Please check the bot and group settings.";

/** Posts each message in order; stops at the first failure. Returns how many were sent. */
export async function sendTelegramMessages(env: TelegramEnv, messages: string[]): Promise<number> {
  let sent = 0;
  for (const text of messages) {
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${env.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.chatId, text, disable_web_page_preview: true }),
        cache: "no-store",
      });
    } catch {
      console.error(`telegram digest: could not reach Telegram (sent ${sent} of ${messages.length}).`);
      throw new Error(TELEGRAM_SEND_FAILED);
    }
    if (!res.ok) {
      console.error(`telegram digest: Telegram answered ${res.status} (sent ${sent} of ${messages.length}).`);
      throw new Error(TELEGRAM_SEND_FAILED);
    }
    sent += 1;
  }
  return sent;
}
