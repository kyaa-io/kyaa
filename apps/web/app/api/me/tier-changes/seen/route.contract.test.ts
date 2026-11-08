import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
const MEMBER = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });

import { POST } from "./route";
const id = "10000000-0000-4000-8000-000000000001";
it("marks only the owner's given rises", async () => {
  state.rpc.mockResolvedValue(1);
  const res = await POST(new Request("https://byus.test/api/me/tier-changes/seen", { method: "POST", body: JSON.stringify({ ids: [id] }) }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ marked: 1 });
  expect(state.rpc).toHaveBeenCalledWith("mark_fan_tier_changes_seen", { p_app_user_id: MEMBER, p_ids: [id] });
});
it("rejects an empty or malformed list before the database", async () => {
  for (const body of [{ ids: [] }, { ids: ["x"] }, { ids: [id], extra: 1 }]) expect((await POST(new Request("https://byus.test/x", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});
