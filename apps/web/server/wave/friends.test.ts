import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createWaveFriendHandlers } from "./friends";

const owner = "91800000-0000-4000-8000-000000000001", target = "91800000-0000-4000-8000-000000000002", requestId = "91800000-0000-4000-8000-000000000003";
const req = (body?: unknown, query = "") => new Request(`https://kyaa.test/api/kyaa-wave/friends${query}`, { method: body ? "POST" : "GET", headers: { authorization: "Bearer test", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
function setup(value: unknown = { friendships: [] }) {
  const deps = { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn().mockResolvedValue(value) };
  return { deps, handlers: createWaveFriendHandlers(deps) };
}
describe("Wave friends server boundary", () => {
  it("lists bounded participants using only the authenticated owner and strips private fields", async () => {
    const member = { profileId: target, nickname: "Participant", avatarUrl: "/images/avatars/star-pink.webp" };
    const { deps, handlers } = setup({ members: [{ ...member, email: "private@example.test", nameEncrypted: "secret" }], nextCursor: target, receiptId: owner });
    const result = await handlers.members(req(undefined, `?locale=en&after=${requestId}&appUserId=other`));
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_members", { p_app_user_id: owner, p_locale: "en", p_after_profile_id: requestId });
    expect(await result.json()).toEqual({ members: [member], nextCursor: target });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("vary")).toContain("Authorization");
  });
  it("rejects invalid or duplicate member cursors and unsupported content locales before RPC", async () => {
    const { deps, handlers } = setup();
    for (const query of ["?after=", "?after=wrong", `?after=${target}&after=${owner}`, "?locale=ru"])
      expect((await handlers.members(req(undefined, query))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    deps.rpc.mockResolvedValue({ members: [], nextCursor: null });
    expect((await handlers.members(req())).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_members", { p_app_user_id: owner, p_locale: "ko", p_after_profile_id: null });
  });
  it("fails closed on oversized or malformed member RPC pages", async () => {
    const member = { profileId: target, nickname: "Participant", avatarUrl: "/images/avatars/star-pink.webp" };
    const { deps, handlers } = setup({ members: Array.from({ length: 51 }, () => member), nextCursor: null });
    expect((await handlers.members(req())).status).toBe(503);
    deps.rpc.mockResolvedValue({ members: [member], nextCursor: "private cursor" });
    expect((await handlers.members(req())).status).toBe(503);
    deps.rpc.mockRejectedValue(new Error("SOCIAL_NOT_FOUND"));
    expect((await handlers.members(req(undefined, `?after=${target}`))).status).toBe(404);
  });
  it("uses authenticated owner and private responses without leaking RPC extras", async () => {
    const { deps, handlers } = setup({ friendships: [], privateName: "secret" });
    const result = await handlers.list(req(undefined, "?locale=en&appUserId=other"));
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_friends", { p_app_user_id: owner, p_locale: "en" });
    expect(await result.json()).toEqual({ friendships: [] });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("vary")).toContain("Authorization");
  });
  it("validates locale, IDs and mutation input before querying", async () => {
    const { deps, handlers } = setup();
    for (const result of [await handlers.list(req(undefined, "?locale=ja")), await handlers.profile(req(), "wrong"), await handlers.messages(req(), "wrong"), await handlers.request(req({ profileId: target })), await handlers.resolve(req({ action: "delete", requestId }), target), await handlers.send(req({ text: " ", requestId }), target), await handlers.send(req({ text: "a".repeat(1001), requestId }), target), await handlers.send(req({ text: "hi", requestId, appUserId: target }), target)]) expect(result.status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("requires authentication for every action", async () => {
    const { deps, handlers } = setup();
    deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    const actions = [handlers.members(req()), handlers.list(req()), handlers.link(req()), handlers.profile(req(), target), handlers.request(req({ profileId: target, requestId })), handlers.resolve(req({ action: "accept", requestId }), target), handlers.messages(req(), target), handlers.send(req({ text: "hi", requestId }), target)];
    for (const action of actions) expect((await action).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("uses only Wave scoped RPCs for the full QR, request, accept and message flow", async () => {
    const { deps, handlers } = setup({ token: target, expiresAt: "2026-10-22T00:00:00Z", path: "hidden" });
    expect(await (await handlers.link(req())).json()).toEqual({ token: target, expiresAt: "2026-10-22T00:00:00Z" });
    deps.rpc.mockResolvedValue({ profile: { id: target, nickname: "Fan", avatarUrl: "/images/avatars/star-cream.webp" }, relationship: { friendshipId: null, status: "none" }, isSelf: false });
    expect((await handlers.profile(req(), target)).status).toBe(200);
    deps.rpc.mockResolvedValue({ id: target, status: "pending", replayed: false, privateName: "hidden" });
    expect((await handlers.request(req({ profileId: target, requestId }))).status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("request_kyaa_wave_friend", { p_app_user_id: owner, p_profile_id: target, p_request_id: requestId });
    deps.rpc.mockResolvedValue({ id: target, status: "accepted", requestId });
    expect((await handlers.resolve(req({ action: "accept", requestId }), target)).status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("resolve_kyaa_wave_friend", { p_app_user_id: owner, p_friendship_id: target, p_action: "accept", p_request_id: requestId });
    deps.rpc.mockResolvedValue({ id: target, firstMessageId: requestId, status: "accepted" });
    expect((await handlers.send(req({ text: " Hello ", requestId }), target)).status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("send_kyaa_wave_friend_message", { p_app_user_id: owner, p_profile_id: target, p_body: "Hello", p_request_id: requestId });
    deps.rpc.mockResolvedValue({ messages: [{ id: requestId, text: "a".repeat(2000), createdAt: "2026-10-21T00:00:00Z", isMine: true, senderId: owner }], hasMore: false });
    const result = await handlers.messages(req(), target);
    expect(result.status).toBe(200);
    expect(await result.text()).not.toContain(owner);
  });
  it.each([["SOCIAL_NOT_FOUND", 404], ["SOCIAL_FORBIDDEN", 403], ["SOCIAL_BLOCKED", 403], ["SOCIAL_CONFLICT", 409], ["SOCIAL_IDEMPOTENCY_CONFLICT", 409], ["SOCIAL_RATE_LIMITED", 429], ["FAN_WEB_FORBIDDEN", 403], ["FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", 403], ["secret database error", 503]])("maps %s safely", async (message, status) => {
    const { deps, handlers } = setup(); deps.rpc.mockRejectedValue(new Error(message));
    const result = await handlers.list(req());
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.text()).not.toContain("secret");
  });
  it("fails closed on malformed RPC responses", async () => {
    const { deps, handlers } = setup(null);
    expect((await handlers.list(req())).status).toBe(503);
    expect((await handlers.link(req())).status).toBe(503);
    expect((await handlers.profile(req(), target)).status).toBe(503);
    expect((await handlers.messages(req(), target)).status).toBe(503);
    expect((await handlers.send(req({ text: "hi", requestId }), target)).status).toBe(503);
    expect((await handlers.request(req({ profileId: target, requestId }))).status).toBe(503);
    expect((await handlers.resolve(req({ action: "accept", requestId }), target)).status).toBe(503);
  });
});
