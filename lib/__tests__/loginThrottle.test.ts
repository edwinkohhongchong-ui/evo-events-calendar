import { describe, it, expect } from "vitest";
import { FailureCounter, clientIp, failureDelayMs, hashIp } from "../loginThrottle";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("clientIp", () => {
  it("prefers Vercel's own header over a forged x-forwarded-for", () => {
    expect(clientIp(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
  });
  it("falls back to x-real-ip, then the LAST x-forwarded-for entry", () => {
    expect(clientIp(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6" }))).toBe("2.2.2.2");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("failureDelayMs", () => {
  it("escalates then caps", () => {
    expect([0, 1, 2, 3, 10].map(failureDelayMs)).toEqual([600, 1200, 2400, 3000, 3000]);
  });
});

describe("FailureCounter", () => {
  it("counts within the window and forgets afterwards", () => {
    const c = new FailureCounter(1000);
    c.record("a", 0); c.record("a", 500);
    expect(c.count("a", 900)).toBe(2);
    expect(c.count("a", 1200)).toBe(1);
    expect(c.count("a", 2000)).toBe(0);
  });
});

describe("hashIp", () => {
  it("is stable, salted and does not contain the address", async () => {
    const a = await hashIp("203.0.113.9", "salt1");
    expect(a).toBe(await hashIp("203.0.113.9", "salt1"));
    expect(a).not.toBe(await hashIp("203.0.113.9", "salt2"));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});
