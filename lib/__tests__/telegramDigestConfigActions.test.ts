import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
const buildDigestMessages = vi.fn();
const store = {
  readAllDigests: vi.fn(),
  readDigest: vi.fn(),
  writeDigest: vi.fn(),
  removeDigest: vi.fn(),
  markSentNow: vi.fn(),
};
vi.mock("../authz", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("../telegramDigestData", () => ({ buildDigestMessages: (...a: unknown[]) => buildDigestMessages(...a) }));
vi.mock("../telegramDigestStore", () => ({
  readAllDigests: (...a: unknown[]) => store.readAllDigests(...a),
  readDigest: (...a: unknown[]) => store.readDigest(...a),
  writeDigest: (...a: unknown[]) => store.writeDigest(...a),
  removeDigest: (...a: unknown[]) => store.removeDigest(...a),
  markSentNow: (...a: unknown[]) => store.markSentNow(...a),
}));

import {
  deleteTelegramDigest,
  generateOverrideText,
  listTelegramDigests,
  previewTelegramDigestFor,
  saveTelegramDigest,
  sendTelegramDigestNow,
} from "../telegramDigestConfigActions";
import { DEFAULT_DIGEST_CONFIG } from "../telegramDigestConfig";

const saved = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;
const savedRow = { ...DEFAULT_DIGEST_CONFIG, id: "d1", last_sent_on: null, created_at: "x", updated_at: "u1", override_text: "stored edit" };

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(undefined);
  buildDigestMessages.mockReset().mockResolvedValue(["line a", "line b"]);
  for (const f of Object.values(store)) f.mockReset();
  process.env.TELEGRAM_BOT_TOKEN = "123456:FAKE-test-token-value";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("telegram digest config actions", () => {
  it("refuse (and touch nothing) when the Editor check fails", async () => {
    requireRole.mockRejectedValue(new Error("You need Edit access to do this."));
    const results = await Promise.all([
      listTelegramDigests(),
      saveTelegramDigest({ config: { name: "a" } }),
      deleteTelegramDigest("d1"),
      previewTelegramDigestFor({ name: "a" }),
      generateOverrideText({ id: "d1" }),
      sendTelegramDigestNow("d1"),
    ]);
    for (const r of results) expect(r).toEqual({ ok: false, error: "You need Edit access to do this." });
    expect(requireRole).toHaveBeenCalledWith("editor");
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled();
    expect(buildDigestMessages).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("save validates with the shared normaliser before writing", async () => {
    const r = await saveTelegramDigest({ config: { name: "a", days_of_week: [] } });
    expect(r).toEqual({ ok: false, error: "Pick at least one day to send on." });
    expect(store.writeDigest).not.toHaveBeenCalled();
  });

  it("save passes the cleaned config, id and optimistic-lock token to the store", async () => {
    store.writeDigest.mockResolvedValue({ ok: true, row: savedRow });
    const r = await saveTelegramDigest({ id: "d1", expectedUpdatedAt: "u0", config: { name: "  Weekly ", days_of_week: [4, 1] } });
    expect(r.ok).toBe(true);
    const [config, id, expected] = store.writeDigest.mock.calls[0];
    expect(config).toMatchObject({ name: "Weekly", days_of_week: [1, 4] });
    expect([id, expected]).toEqual(["d1", "u0"]);
  });

  it("says plainly when the table is missing, and on an edit conflict", async () => {
    store.writeDigest.mockResolvedValue({ ok: false, reason: "missing-table" });
    expect(await saveTelegramDigest({ config: { name: "a" } })).toEqual({ ok: false, error: "Digests aren't switched on yet. Please tell Edwin." });
    store.writeDigest.mockResolvedValue({ ok: false, reason: "conflict" });
    const r = await saveTelegramDigest({ id: "d1", expectedUpdatedAt: "u0", config: { name: "a" } });
    expect(r.ok === false && r.error).toContain("changed or deleted");
    store.removeDigest.mockResolvedValue(false);
    expect(await deleteTelegramDigest("d1")).toEqual({ ok: false, error: "Digests aren't switched on yet. Please tell Edwin." });
  });

  it("previews an unsaved draft without sending, even if the draft has no name or an edited message", async () => {
    const r = await previewTelegramDigestFor({ ...DEFAULT_DIGEST_CONFIG, name: "", override_text: "edited" });
    expect(r).toEqual({ ok: true, data: { messages: ["line a", "line b"] } });
    expect(buildDigestMessages.mock.calls[0][2]).toMatchObject({ override_text: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates the automatic text as one block, from a draft or a saved digest, ignoring any stored edit", async () => {
    expect(await generateOverrideText({ draft: DEFAULT_DIGEST_CONFIG })).toEqual({ ok: true, data: { text: "line a\nline b" } });
    store.readDigest.mockResolvedValue(savedRow);
    await generateOverrideText({ id: "d1" });
    expect(buildDigestMessages.mock.calls[1][2]).toMatchObject({ override_text: null });
    store.readDigest.mockResolvedValue(null);
    expect((await generateOverrideText({ id: "gone" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send now posts the saved digest (with its edited message) and records today's send", async () => {
    store.readDigest.mockResolvedValue(savedRow);
    expect(await sendTelegramDigestNow("d1")).toEqual({ ok: true, data: { sent: 2 } });
    expect(buildDigestMessages.mock.calls[0][2]).toMatchObject({ override_text: "stored edit" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.markSentNow).toHaveBeenCalledTimes(1);
  });

  it("send now does not record a send when Telegram refuses, and fails plainly without setup", async () => {
    store.readDigest.mockResolvedValue(savedRow);
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    const r = await sendTelegramDigestNow("d1");
    expect(r.ok).toBe(false);
    expect(store.markSentNow).not.toHaveBeenCalled();
    delete process.env.TELEGRAM_BOT_TOKEN;
    const none = await sendTelegramDigestNow("d1");
    expect(none.ok === false && none.error).toContain("isn't set up yet");
  });
});
