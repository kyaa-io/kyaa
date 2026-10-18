import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createInvitationContentAdminHandlers, type InvitationContentAdminDependencies } from "./invitation-content-admin";

const actor = "11111111-1111-4111-8111-111111111111";
const allowlist = "22222222-2222-4222-8222-222222222222";
const post = "33333333-3333-4333-8333-333333333333";
const deps: InvitationContentAdminDependencies = {
  authorize: vi.fn(async () => ({ appUserId: actor, allowlistId: allowlist, role: "admin" as const })),
  rpc: vi.fn(),
};
const api = createInvitationContentAdminHandlers(deps);
const request = (method = "GET", body?: unknown) => new Request("https://byus.test/api/admin/community-stamp-invitations/content", {
  method, headers: { authorization: "Bearer admin", "content-type": "application/json", "x-correlation-id": "44444444-4444-4444-8444-444444444444" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, role: "admin" });
});
describe("invitation milestone content admin", () => {
  it("reads candidates and versioned mappings for viewers", async () => {
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, role: "viewer" });
    vi.mocked(deps.rpc).mockResolvedValue({ policyVersion: 1, milestoneSize: 10, mappings: [], candidates: [] });
    expect((await api.read(request())).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_admin_community_stamp_invitation_content", {
      p_actor_app_user_id: actor, p_actor_admin_allowlist_id: allowlist,
    });
  });
  it("creates an audited mapping without accepting preview fields", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ threshold: 10, configVersion: 1, postId: post });
    const response = await api.create(request("POST", { threshold: 10, postId: post, effectiveAt: "2026-10-12T00:00:00.000Z", reason: "첫 초대 마일스톤 콘텐츠를 연결합니다." }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("create_admin_community_stamp_invitation_content", expect.objectContaining({
      p_threshold: 10, p_fan_post_id: post, p_actor_app_user_id: actor,
      p_correlation_id: "44444444-4444-4444-8444-444444444444",
    }));
  });
  it("blocks viewer writes and rejects client-authored image or link facts", async () => {
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, role: "viewer" });
    expect((await api.create(request("POST", { threshold: 10, postId: post, effectiveAt: "2026-10-12T00:00:00.000Z", reason: "검증된 콘텐츠를 연결합니다." }))).status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: actor, allowlistId: allowlist, role: "admin" });
    expect((await api.create(request("POST", { threshold: 10, postId: post, imageUrl: "https://evil.test/x", effectiveAt: "2026-10-12T00:00:00.000Z", reason: "검증된 콘텐츠를 연결합니다." }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});
