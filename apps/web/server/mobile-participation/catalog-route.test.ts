import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createMobileParticipationHandlers } from "./routes";

const owner = "5d100000-0000-4000-8000-000000000001";
const id = "5d100000-0000-4000-8000-000000000002";

describe("participation catalog", () => {
  it("keeps kind in the opaque cursor and scopes the request to the bearer owner", async () => {
    const cursor = { at: "2026-10-12T00:00:00Z", id, kind: "event" };
    const rpc = vi.fn().mockResolvedValue({ items: [], featured: [], nextCursor: cursor });
    const api = createMobileParticipationHandlers({
      authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc,
    });
    const response = await api.catalog(new Request("https://fixture.invalid/api/me/participation/catalog?locale=en&phase=past&kind=event&favorite=nchive"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const result = await response.json();
    expect(JSON.parse(Buffer.from(result.nextCursor, "base64url").toString())).toEqual(cursor);
    await api.catalog(new Request(`https://fixture.invalid/api/me/participation/catalog?phase=past&cursor=${result.nextCursor}`));
    expect(rpc).toHaveBeenNthCalledWith(1, "read_owned_mobile_participation_catalog", {
      p_app_user_id: owner, p_locale: "en", p_phase: "past", p_kind: "event", p_celebrity_slug: "nchive",
      p_after: null, p_after_id: null, p_after_kind: null, p_limit: 20,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "read_owned_mobile_participation_catalog", expect.objectContaining({
      p_after: cursor.at, p_after_id: id, p_after_kind: "event",
    }));
  });

  it.each(["phase=unknown", "kind=admin", "kind=live&kind=event", "cursor=invalid", "limit=1000", "favorite=../private"])("rejects malformed %s without querying data", async (query) => {
    const rpc = vi.fn();
    const api = createMobileParticipationHandlers({ authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc });
    const response = await api.catalog(new Request(`https://fixture.invalid/api/me/participation/catalog?${query}`));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const rpc = vi.fn();
    const api = createMobileParticipationHandlers({ authorize: vi.fn().mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in")), rpc });
    expect((await api.catalog(new Request("https://fixture.invalid/api/me/participation/catalog"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
