import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const {authorize, rpc} = vi.hoisted(() => ({authorize: vi.fn(), rpc: vi.fn()}));
vi.mock("@/server/g6/analytics-route-dependencies", () => ({ createG6AnalyticsRouteDependencies: () => ({ authorize }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({}) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc }) }));
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ appUserId: "actor", allowlistId: "allowlist" });
});
it("binds the month and verified admin to the aggregate RPC", async () => {
  const rows = [{ advertiser: "beepio", impressions: 2, clicks: 5, clicked_sessions: 1 }];
  rpc.mockResolvedValue({ data: rows, error: null });
  const res = await GET(new Request("https://example.test/?month=2026-11"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(rows);
  expect(rpc).toHaveBeenCalledWith("read_admin_banner_month_v2", { p_actor: "actor", p_allowlist: "allowlist", p_month: "2026-11-01" });
});
it("rejects an invalid month before reading the ledger", async () => {
  expect((await GET(new Request("https://example.test/?month=2026-00"))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
