import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authorize: vi.fn(), weekly: vi.fn() }));
vi.mock("@/server/g6/analytics-route-dependencies", () => ({ createG6AnalyticsRouteDependencies: () => ({ authorize: state.authorize }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/admin/ledger-analytics-repository", () => ({ createLedgerAnalyticsRepository: () => ({ weekly: state.weekly }) }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET } from "./route";

const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666", email: "a@example.invalid", role: "viewer" };
const report = { timezone: "Asia/Seoul", weeks: [] };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue(ADMIN); state.weekly.mockResolvedValue(report); });

it("returns the weekly report to a read-only admin without cache", async () => {
  const res = await GET(new Request("https://byus.test/api/admin/analytics/weekly", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toEqual(report);
  expect(state.weekly).toHaveBeenCalledWith({ adminAppUserId: ADMIN.appUserId, adminAllowlistId: ADMIN.allowlistId });
});
it("refuses a non-admin and a query, and hides database failures", async () => {
  state.authorize.mockRejectedValueOnce(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"));
  expect((await GET(new Request("https://byus.test/api/admin/analytics/weekly"))).status).toBe(403);
  state.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "no"));
  expect((await GET(new Request("https://byus.test/api/admin/analytics/weekly"))).status).toBe(401);
  expect(state.weekly).not.toHaveBeenCalled();
  expect((await GET(new Request("https://byus.test/api/admin/analytics/weekly?days=7"))).status).toBe(400);
  state.weekly.mockRejectedValueOnce(new Error("active admin required"));
  const failed = await GET(new Request("https://byus.test/api/admin/analytics/weekly"));
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: { code: "WEEKLY_METRICS_UNAVAILABLE" } });
});
