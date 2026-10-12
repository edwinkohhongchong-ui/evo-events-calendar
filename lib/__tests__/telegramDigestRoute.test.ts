import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The route imports via the "@/..." alias, which this repo's vitest setup
// doesn't resolve; point the aliases at the real modules (data loading is faked,
// so Supabase is never touched).
const buildDigestMessages = vi.fn();
vi.mock("@/lib/safeEqual", async () => await import("../safeEqual"));
vi.mock("@/lib/telegramSend", async () => await import("../telegramSend"));
vi.mock("@/lib/telegramDigestData", () => ({ buildDigestMessages: (...a: unknown[]) => buildDigestMessages(...a) }));

import { GET } from "../../app/api/cron/telegram-digest/route";

const saved = { ...process.env };
const TOKEN = "123456:FAKE-test-token-value";
const SECRET = "cron-secret-for-tests-only-0123456789abcdef";

const call = (auth?: string) =>
  GET(new NextRequest("http://localhost:3000/api/cron/telegram-digest", { headers: auth ? { authorization: auth } : {} }));

let fetchMock: ReturnType<typeof vi.fn>;
let logged: string;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.TELEGRAM_DIGEST_ENABLED = "true";
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  buildDigestMessages.mockReset().mockResolvedValue(["first", "second"]);
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  logged = "";
  const grab = (...a: unknown[]) => void (logged += a.map(String).join(" ") + "\n");
  vi.spyOn(console, "error").mockImplementation(grab);
  vi.spyOn(console, "log").mockImplementation(grab);
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/cron/telegram-digest", () => {
  it("401s without a bearer header and does no work", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(buildDigestMessages).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401s on a wrong bearer, a bare secret, and a different scheme", async () => {
    for (const h of ["Bearer wrong", SECRET, `Basic ${SECRET}`, "Bearer "]) {
      expect((await call(h)).status, h).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is shorter than 32 characters, even with the matching bearer", async () => {
    process.env.CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(401);
  });

  it("fails closed when CRON_SECRET is not set, even for an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips with 200 when TELEGRAM_DIGEST_ENABLED is not \"true\"", async () => {
    for (const v of [undefined, "false", "TRUE", "1"]) {
      if (v === undefined) delete process.env.TELEGRAM_DIGEST_ENABLED;
      else process.env.TELEGRAM_DIGEST_ENABLED = v;
      const res = await call(`Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "disabled" });
    }
    expect(buildDigestMessages).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"])("500s generically when %s is missing, naming it only in the server log", async (name) => {
    delete process.env[name];
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(name);
    expect(logged).toContain(name);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends each chunk in order to the group and never leaks the token", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "sent", messages: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body)).toEqual({ chat_id: "-1001234567890", text: "first", disable_web_page_preview: true });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).text).toBe("second");
    expect(JSON.parse(init.body)).not.toHaveProperty("parse_mode");

    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN);
  });

  it("returns a generic 500 when Telegram refuses, without the token or Telegram's reply", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ description: "Unauthorized secret-detail" }), { status: 401 }));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("secret-detail");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("secret-detail");
    expect(fetchMock).toHaveBeenCalledTimes(1); // stops at the first failure
  });

  it("returns a generic 500 when the network call throws (error text may carry the URL)", async () => {
    fetchMock.mockRejectedValue(new Error(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(logged).not.toContain(TOKEN);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });

  it("returns a generic 500 when the calendar can't be read, sending nothing", async () => {
    buildDigestMessages.mockRejectedValue(new Error("Could not read the calendar. Please try again."));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
