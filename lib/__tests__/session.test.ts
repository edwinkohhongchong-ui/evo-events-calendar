import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionToken, verifySessionToken, SESSION_MAX_AGE_SECONDS } from "../session";

const SECRET = "test-secret-test-secret-test-secret-1234";
const saved = { ...process.env };

function b64url(s: string) {
  return Buffer.from(s).toString("base64url");
}

beforeEach(() => {
  process.env.EVO_SESSION_SECRET = SECRET;
  process.env.EVO_PASSCODE_EDITOR = "editor-pass";
  process.env.EVO_PASSCODE_VIEWER = "viewer-pass";
});
afterEach(() => {
  process.env = { ...saved };
});

describe("session token", () => {
  it("round-trips for both roles", async () => {
    expect(await verifySessionToken((await createSessionToken("editor"))!)).toBe("editor");
    expect(await verifySessionToken((await createSessionToken("viewer"))!)).toBe("viewer");
  });

  it("rejects a tampered payload (role escalation)", async () => {
    const [p, s] = (await createSessionToken("viewer"))!.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = b64url(JSON.stringify({ ...payload, role: "editor" }));
    expect(await verifySessionToken(`${forged}.${s}`)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const [p, s] = (await createSessionToken("editor"))!.split(".");
    const bad = s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
    expect(await verifySessionToken(`${p}.${bad}`)).toBeNull();
  });

  it("rejects an expired token and accepts it just before expiry", async () => {
    const t0 = Date.UTC(2026, 0, 1);
    const token = (await createSessionToken("editor", t0))!;
    expect(await verifySessionToken(token, t0 + (SESSION_MAX_AGE_SECONDS - 1) * 1000)).toBe("editor");
    expect(await verifySessionToken(token, t0 + SESSION_MAX_AGE_SECONDS * 1000)).toBeNull();
  });

  it("rejects an unknown role even when correctly signed", async () => {
    const good = (await createSessionToken("editor"))!;
    const payload = JSON.parse(Buffer.from(good.split(".")[0], "base64url").toString());
    const p = b64url(JSON.stringify({ ...payload, role: "admin" }));
    const sig = Buffer.from(
      await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
        new TextEncoder().encode(p)
      )
    ).toString("base64url");
    expect(await verifySessionToken(`${p}.${sig}`)).toBeNull();
  });

  it("invalidates only the role whose passcode was rotated", async () => {
    const editor = (await createSessionToken("editor"))!;
    const viewer = (await createSessionToken("viewer"))!;
    process.env.EVO_PASSCODE_EDITOR = "new-editor-pass";
    expect(await verifySessionToken(editor)).toBeNull();
    expect(await verifySessionToken(viewer)).toBe("viewer");
  });

  it("invalidates sessions when the secret is rotated", async () => {
    const token = (await createSessionToken("editor"))!;
    process.env.EVO_SESSION_SECRET = "another-secret-another-secret-another-1";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("fails closed when the passcode env var is gone", async () => {
    const token = (await createSessionToken("editor"))!;
    delete process.env.EVO_PASSCODE_EDITOR;
    expect(await verifySessionToken(token)).toBeNull();
    expect(await createSessionToken("editor")).toBeNull();
  });

  it("fails closed with a missing or short secret", async () => {
    const token = (await createSessionToken("editor"))!;
    delete process.env.EVO_SESSION_SECRET;
    expect(await verifySessionToken(token)).toBeNull();
    expect(await createSessionToken("editor")).toBeNull();
    process.env.EVO_SESSION_SECRET = "short";
    expect(await verifySessionToken(token)).toBeNull();
    expect(await createSessionToken("editor")).toBeNull();
  });

  it("rejects old-format role:passcode cookies", async () => {
    expect(await verifySessionToken("editor:editor-pass")).toBeNull();
    expect(await verifySessionToken("viewer:viewer.pass")).toBeNull();
  });

  it("rejects malformed junk without throwing", async () => {
    for (const junk of [undefined, "", ".", "..", "a.b.c", "!!!.???", "%%%", "e30.e30", "bnVsbA.AAAA", "a".repeat(5000)]) {
      expect(await verifySessionToken(junk)).toBeNull();
    }
  });
});
