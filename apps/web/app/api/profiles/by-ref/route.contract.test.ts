import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/social/dependencies", async () => {
  const { createSocialHandlers } = await import("@/server/social/routes");
  return { createSocialRouteHandlers: () => createSocialHandlers(state), socialUnavailable: () => Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }) };
});
import { GET } from "./route";

const ME = "11111111-1111-4111-8111-111111111111";
const ref = { kind: "fan_post", id: "22222222-2222-4222-8222-222222222222" };
const url = (value: unknown = ref) => `https://byus.test/api/profiles/by-ref?ref=${Buffer.from(JSON.stringify(value)).toString("base64url")}&locale=ko`;
const card = { favorite: null, links: [], bio: null, stats: null };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: ME }); });

it("signed out: no viewer goes to SQL and only the public card comes back, uncached", async () => {
  state.rpc.mockResolvedValue({ profile: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 1, progress: {} } }, card });
  const res = await GET(new Request(url()));
  expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("private, no-store"); expect(res.headers.get("vary")).toBe("Authorization");
  expect(state.authorize).not.toHaveBeenCalled();
  expect(state.rpc).toHaveBeenCalledWith("read_social_profile_by_ref", { p_viewer: null, p_ref: ref, p_locale: "ko" });
});
it("signed out: a reply with a member id fails closed instead of reaching the viewer", async () => {
  state.rpc.mockResolvedValue({ profile: { id: ME, nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "v", status: "configured", tier: "Gold", xp: 1, progress: {} } }, card });
  expect((await GET(new Request(url()))).status).toBe(503);
});
it("refuses a bad ref before SQL, answers a closed profile with 404 and a moved ranking with 409", async () => {
  expect((await GET(new Request(url({ kind: "fan_post", id: "x" })))).status).toBe(400);
  expect((await GET(new Request("https://byus.test/api/profiles/by-ref"))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  state.rpc.mockResolvedValue(null); expect((await GET(new Request(url()))).status).toBe(404);
  state.rpc.mockRejectedValue(new Error("SOCIAL_STALE")); expect((await GET(new Request(url()))).status).toBe(409);
});
it("a header that fails asks to sign in", async () => {
  const { AuthError } = await import("@/features/auth/domain/auth-errors");
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
  expect((await GET(new Request(url(), { headers: { authorization: "Bearer bad" } }))).status).toBe(401);
});
