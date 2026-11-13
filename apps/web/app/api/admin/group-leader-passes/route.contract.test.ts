import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), authorizeAdmin: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { GET, POST } from "./route";
const req = (method: string, body?: unknown) => new Request("https://kyaa.test/api/admin/group-leader-passes", { method, headers: { authorization: "Bearer admin", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => { vi.clearAllMocks(); process.env.KYAA_GROUPS_ENABLED = "true"; state.authorizeAdmin.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222", role: "admin", email: "a@example.com" }); });
it("lists for any administrator and issues only for writers; the raw token is returned once and never sent to SQL", async () => {
  state.rpc.mockResolvedValueOnce({ items: [] });
  expect((await GET(req("GET"))).status).toBe(200);
  state.rpc.mockResolvedValueOnce({ id: "33333333-3333-4333-8333-333333333333", label: "방", expiresAt: "2026-11-20T00:00:00Z" });
  const issued = await (await POST(req("POST", { label: "방" }))).json();
  expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(JSON.stringify(state.rpc.mock.calls)).not.toContain(issued.token);
  state.authorizeAdmin.mockResolvedValue({ appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222", role: "viewer", email: "v@example.com" });
  expect((await POST(req("POST", { label: "방" }))).status).toBe(403);
});
