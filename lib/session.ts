import { Role, expectedPasscodeFor } from "./auth";
import { safeEqual } from "./safeEqual";

// Signed session token for the login cookie. Web Crypto only, so the same code
// runs in Edge middleware and in Node server actions / route handlers.
//
// Token = base64url(JSON {role, iat, exp, pw}) + "." + base64url(HMAC-SHA256(secret, payloadB64))
// `pw` is a short fingerprint of the role's passcode at login time, so rotating
// EVO_PASSCODE_EDITOR / EVO_PASSCODE_VIEWER (or the secret itself) logs that
// role out. Everything fails closed: no valid secret, no valid session.

export const SESSION_COOKIE_NAME = "evo_auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MIN_SECRET_LENGTH = 32;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

export function getSessionSecret(): string | null {
  const secret = process.env.EVO_SESSION_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

const encoder = new TextEncoder();


function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(message)));
}

async function passcodeFingerprint(secret: string, passcode: string): Promise<string> {
  const mac = await hmac(secret, "pw:" + passcode);
  return Array.from(mac.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns null when the secret or the role's passcode isn't configured.
export async function createSessionToken(role: Role, nowMs = Date.now()): Promise<string | null> {
  const secret = getSessionSecret();
  const passcode = expectedPasscodeFor(role);
  if (!secret || !passcode) return null;
  const iat = Math.floor(nowMs / 1000);
  const payload = { role, iat, exp: iat + SESSION_MAX_AGE_SECONDS, pw: await passcodeFingerprint(secret, passcode) };
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${payloadB64}.${toBase64Url(await hmac(secret, payloadB64))}`;
}

// Returns the verified role, or null for anything invalid: missing secret,
// old "role:passcode" cookies, malformed/tampered/expired tokens, or a passcode
// that has been rotated since the token was issued.
export async function verifySessionToken(token: string | undefined, nowMs = Date.now()): Promise<Role | null> {
  try {
    const secret = getSessionSecret();
    if (!secret || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const sig = fromBase64Url(sigB64);
    if (!sig) return null;
    // crypto.subtle.verify compares the MAC in constant time.
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sig, encoder.encode(payloadB64));
    if (!ok) return null;

    const raw = fromBase64Url(payloadB64);
    if (!raw) return null;
    const payload = JSON.parse(new TextDecoder().decode(raw));
    if (!payload || typeof payload !== "object") return null;
    const { role, exp, pw } = payload as { role?: unknown; exp?: unknown; pw?: unknown };
    if (role !== "editor" && role !== "viewer") return null;
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp * 1000 <= nowMs) return null;
    if (typeof pw !== "string") return null;
    const passcode = expectedPasscodeFor(role);
    if (!passcode) return null;
    if (!safeEqual(pw, await passcodeFingerprint(secret, passcode))) return null;
    return role;
  } catch {
    return null;
  }
}
