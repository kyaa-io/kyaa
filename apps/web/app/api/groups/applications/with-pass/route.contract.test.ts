import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { POST } from "./route";
const raw = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const requestId = "22222222-2222-4222-8222-222222222222";
const post = (body: unknown) => new Request("https://kyaa.test/api/groups/applications/with-pass", { method: "POST", headers: { authorization: "Bearer ok", "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); process.env.KYAA_GROUPS_ENABLED = "true"; state.authorize.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111" }); });
it("opens a group with the server actor and a hashed pass, and answers the page id only", async () => {
  state.rpc.mockResolvedValue({ pageId: "33333333-3333-4333-8333-333333333333", applicationId: "44444444-4444-4444-8444-444444444444" });
  const res = await POST(post({ token: raw, name: "방", requestId }));
  expect(await res.json()).toEqual({ pageId: "33333333-3333-4333-8333-333333333333" });
  expect(state.rpc).toHaveBeenCalledWith("group_application_submit_with_pass", expect.objectContaining({ p_actor: "11111111-1111-4111-8111-111111111111", p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  expect(JSON.stringify(state.rpc.mock.calls)).not.toContain(raw);
});
it("refuses a client-chosen kind or actor", async () => {
  expect((await POST(post({ token: raw, name: "방", kind: "fan", requestId }))).status).toBe(400);
  expect((await POST(post({ token: raw, name: "방", appUserId: requestId, requestId }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
