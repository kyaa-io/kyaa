import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { POST } from "./route";
const raw = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const post = (body: unknown, auth: string | null = "Bearer ok") => new Request("https://kyaa.test/api/groups/leader-passes/check", { method: "POST", headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); process.env.KYAA_GROUPS_ENABLED = "true"; state.authorize.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111" }); });
it("checks a pass by its hash only, for a signed-in member", async () => {
  state.rpc.mockResolvedValue({ valid: true, label: "방" });
  const res = await POST(post({ token: raw }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ valid: true, label: "방" });
  expect(JSON.stringify(state.rpc.mock.calls)).not.toContain(raw);
});
it("refuses a malformed token before SQL and answers 404 when groups are off", async () => {
  expect((await POST(post({ token: "short" }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  process.env.KYAA_GROUPS_ENABLED = "false";
  expect((await POST(post({ token: raw }))).status).toBe(404);
});
