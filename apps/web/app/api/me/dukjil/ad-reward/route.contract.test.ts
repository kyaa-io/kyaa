import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => state }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET, POST } from "./route";
const MEMBER = "11111111-1111-4111-8111-111111111111";
const BANNER = "22222222-2222-4222-8222-222222222222";
const url = "https://byus.test/api/me/dukjil/ad-reward";
const post = (body: unknown) => POST(new Request(url, { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue({ appUserId: MEMBER }); });

it("asks the database to pay the clicked banner and answers what it paid", async () => {
  state.rpc.mockResolvedValueOnce({ points: 5, capped: false, reason: null, replayed: false });
  const res = await post({ bannerId: BANNER });
  expect([res.status, await res.json()]).toEqual([200, { points: 5, capped: false, reason: null, replayed: false }]);
  expect(state.rpc).toHaveBeenCalledWith("record_ad_click_reward", { p_actor: MEMBER, p_banner: BANNER });
  expect(res.headers.get("cache-control")).toBe("private, no-store");
});

it("answers a refusal (cap, not an ad) as points 0, not an error", async () => {
  state.rpc.mockResolvedValueOnce({ points: 0, capped: true, reason: "POINT_CAP", replayed: false });
  const res = await post({ bannerId: BANNER });
  expect([res.status, (await res.json()).reason]).toEqual([200, "POINT_CAP"]);
});

it("never takes an amount from the caller", async () => {
  const res = await post({ bannerId: BANNER, points: 500 });
  expect(res.status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("refuses a signed-out click without calling the database", async () => {
  state.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "no token"));
  const res = await post({ bannerId: BANNER });
  expect(res.status).toBe(401);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("reads today's paid banners and the remaining count", async () => {
  state.rpc.mockResolvedValueOnce({ kstDate: "2026-11-26", points: 5, dailyLimit: 10, remaining: 9, claimed: [BANNER] });
  const res = await GET(new Request(url, { headers: { authorization: "Bearer valid" } }));
  expect([res.status, await res.json()]).toEqual([200, { kstDate: "2026-11-26", points: 5, dailyLimit: 10, remaining: 9, claimed: [BANNER] }]);
  expect(state.rpc).toHaveBeenCalledWith("read_ad_click_rewards_today", { p_actor: MEMBER });
});
