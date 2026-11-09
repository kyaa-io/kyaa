import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkInstaRepostUrl } from "@/features/insta-repost/domain/insta-repost";
import { createDukjilHandlers } from "@/server/dukjil/routes";
import { createInstaRepostHandlers } from "./routes";

const FAN = "11111111-1111-4111-8111-111111111111", CREATOR = "22222222-2222-4222-8222-222222222222", ID = "33333333-3333-4333-8333-333333333333", ASSET = "44444444-4444-4444-8444-444444444444";
const request = (path: string, body?: unknown) => new Request(`https://byus.test${path}`, {
  method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer valid" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const handlers = (rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>, stream = vi.fn()) => createInstaRepostHandlers({
  rpc, stream, authorize: async () => ({ appUserId: FAN }), resolveCreatorId: async slug => slug === "elina" ? CREATOR : null,
  authorizeAdmin: async () => ({ email: "a@byus.test", role: "admin", appUserId: FAN, allowlistId: ID }),
});

describe("instagram repost addresses", () => {
  it("reduces feed and reels to the share key, stories to instagram-story:<id>", () => {
    expect(checkInstaRepostUrl("https://www.instagram.com/reel/C1aBc_D-2xY/?igsh=x", "reel")).toEqual({ ok: true, value: { url: "https://www.instagram.com/reel/C1aBc_D-2xY/", key: "instagram:C1aBc_D-2xY" } });
    expect(checkInstaRepostUrl("instagram.com/stories/elina.fan/3412345678901234567?utm=1", "story")).toEqual({ ok: true, value: { url: "https://www.instagram.com/stories/elina.fan/3412345678901234567/", key: "instagram-story:3412345678901234567" } });
    expect(checkInstaRepostUrl("https://x.com/fan/status/1850000000000000001", "feed")).toEqual({ ok: false, problem: "unsupported" });
    expect(checkInstaRepostUrl("https://www.instagram.com/stories/elina.fan/", "story")).toEqual({ ok: false, problem: "not_post" });
    expect(checkInstaRepostUrl("https://l.instagram.com/?u=x", "story")).toEqual({ ok: false, problem: "short" });
  });
});

describe("repost routes", () => {
  it("sends a checked address, or a story capture without one, and refuses a story without its capture before the database", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ id: ID, status: "pending", replayed: false, duplicate: false }));
    expect((await handlers(rpc).submit(request("/x", { creator: "elina", postKind: "feed", url: "https://www.instagram.com/p/C1aBc_D-2xY/", ownPost: true }))).status).toBe(201);
    expect(rpc.mock.calls[0]).toEqual(["submit_fan_insta_repost", { p_user: FAN, p_celebrity: CREATOR, p_post_kind: "feed", p_url: "https://www.instagram.com/p/C1aBc_D-2xY/", p_url_key: "instagram:C1aBc_D-2xY", p_asset_id: null, p_own_post: true }]);
    expect((await handlers(rpc).submit(request("/x", { creator: "elina", postKind: "story", captureId: ASSET, ownPost: true }))).status).toBe(201);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_post_kind: "story", p_url: null, p_url_key: null, p_asset_id: ASSET });
    const missing = await handlers(rpc).submit(request("/x", { creator: "elina", postKind: "story", ownPost: true }));
    expect(missing.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(2);
    const own = await handlers(rpc).submit(request("/x", { creator: "elina", postKind: "feed", url: "https://www.instagram.com/p/C1aBc_D-2xY/" }));
    expect(await own.json()).toEqual({ error: { code: "SHARE_PROOF_OWN_POST_REQUIRED" } });
  });
  it.each([["SELF_REVIEW_FORBIDDEN", 403], ["REVIEW_FORBIDDEN", 403], ["REVIEW_STALE", 409], ["SHARE_PROOF_NOT_FOUND", 404], ["boom", 503]])("maps %s to %i", async (code, status) => {
    const res = await handlers(async () => { throw new Error(code); }).adminReview(request("/x", { decision: "accept", revision: 0 }), ID);
    expect(res.status).toBe(status);
  });
  it("streams a capture only when the database allows it, without the storage path", async () => {
    const stream = vi.fn(async () => new Response("png", { status: 200 }));
    const ok = await handlers(async () => ({ storagePath: "mobile/secret.png", contentType: "image/png" }), stream).pageCapture(request("/x"), ID);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(await ok.text()).toBe("png");
    expect([...ok.headers.values()].join(" ")).not.toContain("secret");
    const denied = await handlers(async () => null, stream).ownCapture(request("/x"), ID);
    expect(denied.status).toBe(404);
  });
});

describe("cheer route refusals", () => {
  it.each([["DUKJIL_FAVORITE_REQUIRED", 409, "favorite_required"], ["ACCOUNT_INACTIVE", 403, "account_restricted"], ["POLICY_INACTIVE", 409, "POLICY_INACTIVE"]])("%s", async (raised, status, code) => {
    const res = await createDukjilHandlers({ authorize: async () => ({ appUserId: FAN }), rpc: async () => { throw new Error(raised); } }).cheer(request("/x", {}));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code } });
  });
});
