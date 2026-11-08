// Dependency-free login throttle + safe failure logging helpers.
//
// State lives in module memory, so it is per serverless instance: it slows
// guessing but cannot be a global guarantee. Vercel WAF rate limiting on
// POST /api/login is still the real cross-instance control.
// Nothing here ever sees, stores or logs a passcode (or any part of one).

export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_FAILURES_PER_IP = 8;
// Failures across ALL clients for one role. High enough that staff typos never
// reach it; low enough that a distributed guesser on one instance is stopped.
export const MAX_FAILURES_PER_ROLE = 60;
const BASE_DELAY_MS = 600;
const MAX_DELAY_MS = 3000;

// Escalating pause after a wrong passcode: 0.6s, 1.2s, 2.4s, then 3s.
export function failureDelayMs(failuresBeforeThis: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, failuresBeforeThis), MAX_DELAY_MS);
}

// Prefer headers the Vercel edge sets itself. x-forwarded-for is only a last
// resort, and then the LAST entry (appended by the nearest trusted proxy) is
// used, not the first (which a client can forge).
export function clientIp(headers: { get(name: string): string | null }): string {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

// Salted, truncated SHA-256 so logs can group attempts by client without
// storing the address itself.
export async function hashIp(ip: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|ip|${ip}`));
  return Array.from(new Uint8Array(buf).slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class FailureCounter {
  private hits = new Map<string, number[]>();
  constructor(private windowMs = WINDOW_MS) {}

  count(key: string, now: number): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length) this.hits.set(key, recent);
    else this.hits.delete(key);
    return recent.length;
  }

  record(key: string, now: number): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length;
  }

  prune(now: number) {
    Array.from(this.hits.keys()).forEach((k) => this.count(k, now));
  }

  clear() {
    this.hits.clear();
  }
}

export const ipFailures = new FailureCounter();
export const roleFailures = new FailureCounter();
