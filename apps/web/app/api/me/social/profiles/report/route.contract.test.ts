import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/social/dependencies", async () => {
  const { createSocialHandlers } = await import("@/server/social/routes");
  return { createSocialRouteHandlers: () => createSocialHandlers(state), socialUnavailable: () => Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }) };
});
import { AuthError } from "@/features/auth/domain/auth-errors";
import { POST } from "./route";
const ME = "11111111-1111-4111-8111-111111111111", ref = { kind: "fan_post", id: "22222222-2222-4222-8222-222222222222" }, requestId = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown) => new Request("https://byus.test/api/me/social/profiles/report", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: ME }); });

it("files one report for the signed-in viewer", async () => {
  state.rpc.mockResolvedValue({ id: requestId, reported: true });
  expect((await POST(post({ ref, reason: "spam", details: "  광고  ", requestId }))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("report_social_profile", { p_viewer: ME, p_ref: ref, p_reason: "spam", p_details: "광고", p_request_id: requestId });
});
it("refuses an unknown reason or long details before SQL, and maps the daily limit", async () => {
  expect((await POST(post({ ref, reason: "nope", requestId }))).status).toBe(400);
  expect((await POST(post({ ref, reason: "spam", details: "가".repeat(501), requestId }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  state.rpc.mockRejectedValue(new Error("SOCIAL_RATE_LIMITED")); expect((await POST(post({ ref, reason: "spam", requestId }))).status).toBe(429);
});
it("asks a signed-out caller to sign in", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
  expect((await POST(post({ ref, reason: "spam", requestId }))).status).toBe(401);
});
