import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The route imports via the "@/..." alias, which this repo's vitest setup
// doesn't resolve; point the aliases at the real modules (data loading is faked,
// so Supabase is never touched).
const buildDigestMessages = vi.fn();
vi.mock("@/lib/safeEqual", async () => await import("../safeEqual"));
vi.mock("@/lib/telegramSend", async () => await import("../telegramSend"));
vi.mock("@/lib/telegramDigestData", () => ({ buildDigestMessages: (...a: unknown[]) => buildDigestMessages(...a) }));
vi.mock("@/lib/dates", async () => await import("../dates"));
vi.mock("@/lib/telegramDigestConfig", async () => await import("../telegramDigestConfig"));

// In-memory stand-in for the telegram_digests table that keeps the real
// store's rules: the claim only succeeds if today isn't already taken.
let table: { ready: boolean; rows: TelegramDigestRow[] };
let readError: Error | null;
const store = {
  readAllDigests: vi.fn(async () => {
    if (readError) throw readError;
    return table.ready ? { ready: true, rows: table.rows.map((r) => ({ ...r })) } : { ready: false, rows: [] };
  }),
  claimDigest: vi.fn(async (row: TelegramDigestRow, today: string) => {
    const stored = table.rows.find((r) => r.id === row.id)!;
    if (stored.last_sent_on === today) return false;
    stored.last_sent_on = today;
    if (row.skip_next) stored.skip_next = false;
    return true;
  }),
  releaseClaim: vi.fn(async (row: TelegramDigestRow, today: string) => {
    const stored = table.rows.find((r) => r.id === row.id)!;
    if (stored.last_sent_on === today) stored.last_sent_on = row.last_sent_on;
  }),
  consumeOverride: vi.fn(async (row: TelegramDigestRow) => {
    const stored = table.rows.find((r) => r.id === row.id)!;
    if (row.override_text && stored.override_text === row.override_text) stored.override_text = null;
  }),
};
vi.mock("@/lib/telegramDigestStore", () => ({
  readAllDigests: () => store.readAllDigests(),
  claimDigest: (...a: [TelegramDigestRow, string]) => store.claimDigest(...a),
  releaseClaim: (...a: [TelegramDigestRow, string]) => store.releaseClaim(...a),
  consumeOverride: (...a: [TelegramDigestRow]) => store.consumeOverride(...a),
}));

import { GET } from "../../app/api/cron/telegram-digest/route";
import { DEFAULT_DIGEST_CONFIG } from "../telegramDigestConfig";
import type { TelegramDigestRow } from "../types";

const saved = { ...process.env };
const TOKEN = "123456:FAKE-test-token-value";
const SECRET = "cron-secret-for-tests-only-0123456789abcdef";

const call = (auth?: string) =>
  GET(new NextRequest("http://localhost:3000/api/cron/telegram-digest", { headers: auth ? { authorization: auth } : {} }));

let fetchMock: ReturnType<typeof vi.fn>;
let logged: string;

// The cron fires at 11:30 UTC = 19:30 in Singapore, the same calendar day.
const SUNDAY = new Date("2026-10-11T11:30:00Z");
const TUESDAY = new Date("2026-10-13T11:30:00Z");

const digest = (over: Partial<TelegramDigestRow> = {}): TelegramDigestRow => ({
  ...DEFAULT_DIGEST_CONFIG,
  id: "d1",
  last_sent_on: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SUNDAY);
  table = { ready: false, rows: [] }; // before migration 029
  readError = null;
  for (const fn of Object.values(store)) fn.mockClear();
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
  vi.useRealTimers();
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

  it("sends nothing on a non-Sunday when no digests exist (the old schedule was Sunday-only)", async () => {
    vi.setSystemTime(TUESDAY);
    for (const ready of [false, true]) {
      table = { ready, rows: [] };
      const res = await call(`Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "none due" });
    }
    expect(buildDigestMessages).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the default digest on Sunday when the table has no rows, calling the builder without a config", async () => {
    table = { ready: true, rows: [] };
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toEqual({ status: "sent", messages: 2 });
    expect(buildDigestMessages.mock.calls[0][2]).toBeUndefined();
    expect(store.claimDigest).not.toHaveBeenCalled();
  });

  it("500s generically and sends nothing when the digests can't be read", async () => {
    readError = new Error("relation telegram_digests secret-detail");
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret-detail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/telegram-digest with configured digests", () => {
  it("sends only digests due today and records the send", async () => {
    table = {
      ready: true,
      rows: [
        digest({ id: "sun", name: "Sun" }),
        digest({ id: "tue", name: "Tue", days_of_week: [2] }),
        digest({ id: "off", name: "Off", enabled: false }),
      ],
    };
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toEqual({ status: "sent", digests: 1, messages: 2, skipped: 0 });
    expect(buildDigestMessages).toHaveBeenCalledTimes(1);
    expect(buildDigestMessages.mock.calls[0][2]).toMatchObject({ name: "Sun", days_of_week: [0] });
    expect(table.rows.find((r) => r.id === "sun")!.last_sent_on).toBe("2026-10-11");
    expect(table.rows.find((r) => r.id === "tue")!.last_sent_on).toBeNull();
  });

  it("does nothing when digests exist but none is due or enabled (never falls back to the default)", async () => {
    table = { ready: true, rows: [digest({ enabled: false })] };
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ status: "none due" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not double-send when triggered twice on the same day", async () => {
    table = { ready: true, rows: [digest()] };
    const first = await call(`Bearer ${SECRET}`);
    const second = await call(`Bearer ${SECRET}`);
    expect((await first.json()).status).toBe("sent");
    expect(await second.json()).toEqual({ status: "none due" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // the one digest's two chunks, once
  });

  it("two overlapping triggers: only the one that wins the claim sends", async () => {
    table = { ready: true, rows: [digest()] };
    const [a, b] = await Promise.all([call(`Bearer ${SECRET}`), call(`Bearer ${SECRET}`)]);
    const statuses = [(await a.json()).status, (await b.json()).status].sort();
    expect(statuses).toEqual(["none due", "sent"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skip_next: keeps today's claim, clears the flag and sends nothing", async () => {
    table = { ready: true, rows: [digest({ skip_next: true })] };
    const res = await call(`Bearer ${SECRET}`);
    expect(await res.json()).toEqual({ status: "skipped", digests: 0, messages: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(table.rows[0]).toMatchObject({ skip_next: false, last_sent_on: "2026-10-11" });
    // A second trigger the same day still does not send.
    expect((await (await call(`Bearer ${SECRET}`)).json()).status).toBe("none due");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an edited message is sent once, then cleared so the next send is automatic", async () => {
    table = { ready: true, rows: [digest({ override_text: "My own wording" })] };
    await call(`Bearer ${SECRET}`);
    expect(buildDigestMessages.mock.calls[0][2]).toMatchObject({ override_text: "My own wording" });
    expect(table.rows[0].override_text).toBeNull();
    // Next Sunday.
    vi.setSystemTime(new Date("2026-10-18T11:30:00Z"));
    await call(`Bearer ${SECRET}`);
    expect(buildDigestMessages.mock.calls[1][2]).toMatchObject({ override_text: null });
  });

  it("a failed send releases the claim, keeps the edited message and reports a generic failure", async () => {
    table = { ready: true, rows: [digest({ override_text: "Keep me", last_sent_on: "2026-10-04" })] };
    fetchMock.mockResolvedValue(new Response("nope secret-detail", { status: 500 }));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("secret-detail");
    expect(text).not.toContain(TOKEN);
    expect(table.rows[0]).toMatchObject({ last_sent_on: "2026-10-04", override_text: "Keep me" });
    // A retry the same day can send.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await (await call(`Bearer ${SECRET}`)).json()).status).toBe("sent");
  });

  it("keeps going with the other digests when one fails", async () => {
    table = { ready: true, rows: [digest({ id: "a", name: "A" }), digest({ id: "b", name: "B" })] };
    buildDigestMessages.mockImplementation(async (_n: unknown, _u: unknown, config: { name: string }) => {
      if (config.name === "A") throw new Error("Could not read the calendar. Please try again.");
      return ["ok"];
    });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "The digest could not be sent.", sent: 1, failed: 1 });
    expect(table.rows.find((r) => r.id === "a")!.last_sent_on).toBeNull();
    expect(table.rows.find((r) => r.id === "b")!.last_sent_on).toBe("2026-10-11");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Singapore weekday: a trigger after 16:00 UTC Sunday is already Monday", async () => {
    table = { ready: true, rows: [digest({ days_of_week: [1] })] };
    vi.setSystemTime(new Date("2026-10-11T16:30:00Z"));
    const res = await call(`Bearer ${SECRET}`);
    expect((await res.json()).status).toBe("sent");
    expect(table.rows[0].last_sent_on).toBe("2026-10-12");
  });

  it("never leaks row contents or the token in the response", async () => {
    table = { ready: true, rows: [digest({ name: "Private Name", intro: "Private intro" })] };
    const text = JSON.stringify(await (await call(`Bearer ${SECRET}`)).json());
    for (const bad of ["Private", TOKEN, SECRET]) expect(text).not.toContain(bad);
  });
});
