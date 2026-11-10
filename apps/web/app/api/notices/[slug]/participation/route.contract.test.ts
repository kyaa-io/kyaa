import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET } from "./route";
const context = { params: Promise.resolve({ slug: "service-guide" }) };
beforeEach(() => vi.clearAllMocks());
it("passes the slug to the real public handler and keeps its response private", async () => {
  const value = { reaction: null, likeCount: 2, dislikeCount: null, commentCount: 0 };
  state.rpc.mockResolvedValue(value);
  const response = await GET(new Request("https://kyaa.test/api/notices/service-guide/participation"), context);
  expect(await response.json()).toEqual(value);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("read_home_notice_participation", { p_slug: "service-guide", p_app_user_id: null });
  expect(state.authorize).not.toHaveBeenCalled();
});
it("returns expired bearer errors without running an RPC", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"));
  const response = await GET(new Request("https://kyaa.test/api/notices/service-guide/participation", { headers: { authorization: "Bearer expired" } }), context);
  expect(response.status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
