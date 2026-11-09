import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/social/dependencies", async () => {
  const { createSocialHandlers } = await import("@/server/social/routes");
  return { createSocialRouteHandlers: () => createSocialHandlers(state), socialUnavailable: () => Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }) };
});
import { POST } from "./route";
const ref = { kind: "fan_post", id: "22222222-2222-4222-8222-222222222222" };
const post = (body: unknown) => new Request("https://byus.test/api/profiles/return-ref", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());

it("issues a return ref without sign-in", async () => {
  state.rpc.mockResolvedValue({ returnRef: "33333333-3333-4333-8333-333333333333" });
  const res = await POST(post({ ref }));
  expect(res.status).toBe(200); expect(await res.json()).toEqual({ returnRef: "33333333-3333-4333-8333-333333333333" });
  expect(state.rpc).toHaveBeenCalledWith("issue_social_profile_return_ref", { p_ref: ref });
  expect(state.authorize).not.toHaveBeenCalled();
});
it("refuses extra fields and maps refusals", async () => {
  expect((await POST(post({ ref, profileId: "x" }))).status).toBe(400);
  state.rpc.mockRejectedValue(new Error("SOCIAL_FORBIDDEN")); expect((await POST(post({ ref: { kind: "profile", profileId: "22222222-2222-4222-8222-222222222222" } }))).status).toBe(403);
  state.rpc.mockRejectedValue(new Error("SOCIAL_NOT_FOUND")); expect((await POST(post({ ref }))).status).toBe(404);
});
