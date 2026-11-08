import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authorize: vi.fn(), funnel: vi.fn() }));
vi.mock("@/server/g6/analytics-route-dependencies", () => ({ createG6AnalyticsRouteDependencies: () => ({ authorize: state.authorize }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/admin/ledger-analytics-repository", () => ({ createLedgerAnalyticsRepository: () => ({ funnel: state.funnel, webTraffic: vi.fn() }) }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET } from "./route";

const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666", email: "a@example.invalid", role: "viewer" };
const report = { days: 30, from: "2026-10-10T00:00:00Z", to: "2026-11-09T00:00:00Z", pageViewsSince: null, steps: { visitors: 0, accountCreated: 3, fanVerified: 1, firstActivity: 0 } };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue(ADMIN); state.funnel.mockResolvedValue(report); });

it("returns the funnel for an admin and the chosen period", async () => {
  const res = await GET(new Request("https://byus.test/api/admin/analytics/funnel?days=30", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toEqual(report);
  expect(state.funnel).toHaveBeenCalledWith({ adminAppUserId: ADMIN.appUserId, adminAllowlistId: ADMIN.allowlistId, days: 30 });
});
it("refuses a non-admin, an unknown period and hides database failures", async () => {
  state.authorize.mockRejectedValueOnce(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"));
  expect((await GET(new Request("https://byus.test/api/admin/analytics/funnel?days=7"))).status).toBe(403);
  expect((await GET(new Request("https://byus.test/api/admin/analytics/funnel?days=14"))).status).toBe(400);
  state.funnel.mockRejectedValueOnce(new Error("active admin required"));
  const failed = await GET(new Request("https://byus.test/api/admin/analytics/funnel?days=7"));
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: { code: "FUNNEL_ANALYTICS_UNAVAILABLE" } });
});
