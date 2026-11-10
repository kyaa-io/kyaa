import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET, POST } from "./route";
const owner = "a0000000-0000-4000-8000-000000000001", id = "b0000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ slug: "service-guide" }) };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: owner }); });
it("maps a public localized page through the real comments handler", async () => {
  state.rpc.mockResolvedValue({ items: [], hasMore: false });
  const response = await GET(new Request("https://kyaa.test/api/notices/service-guide/comments?locale=en"), context);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
  expect(state.rpc).toHaveBeenCalledWith("read_home_notice_comments", { p_slug: "service-guide", p_app_user_id: null, p_locale: "en", p_before: null, p_before_id: null });
});
it("forwards an authenticated POST and preserves its retry key", async () => {
  state.rpc.mockResolvedValue({ id, revision: 1, replayed: false });
  const response = await POST(new Request("https://kyaa.test/api/notices/service-guide/comments", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ body: " 감사합니다. ", idempotencyKey: id }) }), context);
  expect(await response.json()).toEqual({ id, revision: 1, replayed: false });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("post_home_notice_comment", { p_slug: "service-guide", p_app_user_id: owner, p_body: "감사합니다.", p_idempotency_key: id });
});
