import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createMobileContentHandlers } from "./routes";
const owner = "79000000-0000-4000-8000-000000000001", requestId = "79000000-0000-4000-8000-000000000005";
function setup() { const authorize = vi.fn().mockResolvedValue({ appUserId: owner }), rpc = vi.fn(); return { authorize, rpc, api: createMobileContentHandlers({ authorize, rpc }) }; }
function request(body?: unknown, query = "") { return new Request(`https://byus.test/api${query}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
describe("official author routes", () => {
  it("binds capability to the authenticated owner and keeps it private", async () => {
    const d = setup(); d.rpc.mockResolvedValue({ canPublish: false, displayName: "Artist", accountName: null });
    const response = await d.api.officialPosts(request(undefined, "?locale=en"), "artist");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(d.rpc).toHaveBeenCalledWith("read_owned_mobile_official_capability", { p_app_user_id: owner, p_slug: "artist", p_locale: "en" });
  });
  it("preserves the publication key and calls only the official writer", async () => {
    const d = setup(); d.rpc.mockResolvedValue({ id: requestId, revision: 2, replayed: true });
    const response = await d.api.officialPosts(request({ body: "  Message  ", assetIds: [], idempotencyKey: requestId }), "artist");
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ replayed: true });
    expect(d.rpc).toHaveBeenCalledWith("publish_owned_mobile_official_post", { p_app_user_id: owner, p_slug: "artist", p_body: "Message", p_asset_ids: [], p_idempotency_key: requestId });
  });
  it("rejects owner injection, duplicate attachments, empty text, and duplicate locale", async () => {
    for (const input of [{ body: "Message", assetIds: [], idempotencyKey: requestId, appUserId: requestId }, { body: "", assetIds: [], idempotencyKey: requestId }, { body: "Message", assetIds: [requestId, requestId], idempotencyKey: requestId }]) {
      const d = setup(); expect((await d.api.officialPosts(request(input), "artist")).status).toBe(400); expect(d.rpc).not.toHaveBeenCalled();
    }
    const d = setup(); expect((await d.api.officialPosts(request(undefined, "?locale=en&locale=ko"), "artist")).status).toBe(400);
  });
  it("keeps authentication and revoked author failures closed", async () => {
    const d = setup(); d.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect((await d.api.officialPosts(request(), "artist")).status).toBe(401);
    d.rpc.mockRejectedValueOnce(new Error("FAN_WEB_FORBIDDEN"));
    expect((await d.api.officialPosts(request({ body: "Message", assetIds: [], idempotencyKey: requestId }), "artist")).status).toBe(403);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers only the verified owner's publication receipt", async () => {
    const d = setup(); d.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: requestId, revision: 2, replayed: true });
    expect(await (await d.api.officialPostStatus(request(), "artist", requestId)).json()).toEqual({ result: null });
    expect(await (await d.api.officialPostStatus(request(), "artist", requestId)).json()).toMatchObject({ result: { id: requestId, replayed: true } });
    expect(d.rpc).toHaveBeenCalledWith("read_owned_mobile_official_post_result", { p_app_user_id: owner, p_slug: "artist", p_idempotency_key: requestId });
  });

});
