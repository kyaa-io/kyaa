import { beforeEach, expect, it, vi } from "vitest";
import adminRows from "@/server/home-notice/fixtures/list_admin_home_notices.json";
import linkTargets from "@/server/home-notice/fixtures/list_admin_home_notice_link_targets.json";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn(), role: "admin" as string }));
vi.mock("@/server/home-notice/home-notice-dependencies", async () => {
  const { HomeNoticeRepository } = await import("@/server/home-notice/home-notice-repository");
  return { createHomeNoticeAdminDependencies: () => ({
    authorize: async () => ({ email: "a@example.invalid", role: state.role, appUserId: "a0000000-0000-4000-8000-000000000001", allowlistId: "a0000000-0000-4000-8000-000000000002" }),
    repository: new HomeNoticeRepository({ rpc: state.rpc } as never),
    registerImage: async () => ({ url: "https://db.test/x.webp" }),
    invalidatePublicContent: state.invalidate,
  }) };
});
import { GET, POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); state.role = "admin"; });
const post = (body: unknown) => new Request("https://byus.test/api/admin/home-notices", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body) });

it("lists the real admin rows privately", async () => {
  state.rpc.mockImplementation(async (name: string) => ({ data: name === "list_admin_home_notice_link_targets" ? linkTargets : adminRows, error: null }));
  const res = await GET(new Request("https://byus.test/api/admin/home-notices", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.notices).toHaveLength(adminRows.length);
  expect(body.notices[0]).toHaveProperty("home_notice_localizations");
  expect(body.notices[0]).toHaveProperty("linked_group_page_id");
  expect(body.linkTargets).toEqual(linkTargets);
  expect(state.rpc).toHaveBeenCalledWith("list_admin_home_notices", { p_actor_app_user_id: "a0000000-0000-4000-8000-000000000001", p_actor_admin_allowlist_id: "a0000000-0000-4000-8000-000000000002" });
});

it("publishes with the state RPC and invalidates once; refuses postType, viewers and failures without invalidating", async () => {
  state.rpc.mockResolvedValue({ data: null, error: null });
  expect((await POST(post({ action: "publish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 2 }))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("set_admin_home_notice_state", expect.objectContaining({ p_action: "publish", p_expected_revision: 2, p_reason: null }));
  expect(state.invalidate).toHaveBeenCalledTimes(1);
  state.invalidate.mockClear();
  expect((await POST(post({ action: "save", slug: "a", category: "guide", pinned: false, postType: "notice", localizations: {} }))).status).toBe(400);
  state.rpc.mockResolvedValue({ data: null, error: { message: "home notice is immutable" } });
  expect((await POST(post({ action: "unpublish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 2 }))).status).toBe(409);
  state.role = "viewer";
  expect((await POST(post({ action: "unpublish", id: "b0000000-0000-4000-8000-000000000001", expectedRevision: 2 }))).status).toBe(403);
  expect(state.invalidate).not.toHaveBeenCalled();
});
