import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { POST } from "./route";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const post = () => POST(new Request("https://byus.test/api/me/dukjil/cheer", { method: "POST", headers: { authorization: "Bearer valid" } }));
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });
it("cheers the favorite and answers what this tap earned, never a points field", async () => {
  state.rpc.mockResolvedValueOnce({ earned: 3, stamped: true, replayed: false, at: "2026-11-09T10:00:00+09:00", celebrityId: "22222222-2222-4222-8222-222222222222", celebritySlug: "elina" });
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ earned: 3, stamped: true, replayed: false, celebrity: { slug: "elina" } });
  expect(state.rpc).toHaveBeenCalledWith("cheer_dukjil_favorite", { p_user: MEMBER });
});
it("answers favorite_required and account_restricted for the screen to act on", async () => {
  state.rpc.mockRejectedValueOnce(new Error("DUKJIL_FAVORITE_REQUIRED"));
  const a = await post();
  expect([a.status, await a.json()]).toEqual([409, { error: { code: "favorite_required" } }]);
  state.rpc.mockRejectedValueOnce(new Error("ACCOUNT_INACTIVE"));
  const b = await post();
  expect([b.status, await b.json()]).toEqual([403, { error: { code: "account_restricted" } }]);
});
