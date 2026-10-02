import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const cookiesMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));
vi.mock("../supabase", () => ({ supabase: { from: () => ({ insert }) } }));

import { logActivity } from "../activity";
import { createSessionToken } from "../session";

const tokens = { editor: "", viewer: "" };

beforeEach(async () => {
  process.env.EVO_SESSION_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.EVO_PASSCODE_EDITOR = "editor-pw";
  process.env.EVO_PASSCODE_VIEWER = "viewer-pw";
  tokens.editor = (await createSessionToken("editor"))!;
  tokens.viewer = (await createSessionToken("viewer"))!;
  insert.mockReset();
  cookiesMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const input = { action: "added", entity: "event", entityId: "e1", label: "Youth Camp", itemDate: "2026-10-09" } as const;

describe("logActivity never throws", () => {
  it("swallows a missing/failed table", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: tokens.editor }) });
    insert.mockResolvedValue({ error: { message: 'relation "activity_log" does not exist' } });
    await expect(logActivity(input)).resolves.toBeUndefined();
  });
  it("swallows a thrown client error", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: tokens.viewer }) });
    insert.mockRejectedValue(new Error("network"));
    await expect(logActivity(input)).resolves.toBeUndefined();
  });
  it("swallows cookies() failing", async () => {
    cookiesMock.mockRejectedValue(new Error("no request scope"));
    await expect(logActivity(input)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
  it("inserts role, computed href and truncated label on success", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: tokens.viewer }) });
    insert.mockResolvedValue({ error: null });
    await logActivity(input);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_role: "viewer",
        action: "added",
        entity: "event",
        entity_id: "e1",
        item_date: "2026-10-09",
        href: "/?year=2026&month=10&focus=event:e1",
      })
    );
  });
});
