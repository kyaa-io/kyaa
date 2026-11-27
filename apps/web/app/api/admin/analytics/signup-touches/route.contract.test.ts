import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/g6/analytics-route-dependencies", () => ({ createG6AnalyticsRouteDependencies: () => ({ authorize: state.authorize }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc: state.rpc }) }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET } from "./route";

const ADMIN = { appUserId: "55555555-5555-4555-8555-555555555555", allowlistId: "66666666-6666-4666-8666-666666666666", email: "a@example.invalid", role: "viewer" };
// Shape copied from a real read_admin_signup_touches() result on the local database (one new member, KST hours).
const report = {
  to: "2026-11-26T19:09:22.695284+09:00", days: 30, from: "2026-10-28T00:00:00+09:00", timeZone: "Asia/Seoul", total: 1,
  apps: [{ label: "x", signups: 1 }], paths: [{ label: "x / kol / alina", signups: 1 }], daily: [{ date: "2026-11-26", signups: 1 }],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, signups: hour === 19 ? 1 : 0 })),
  pathHours: [{ date: "2026-11-26", hour: 19, label: "x / kol / alina", signups: 1 }],
};
const empty = { ...report, total: 0, apps: [], paths: [], daily: [], pathHours: [], hourly: report.hourly.map(({ hour }) => ({ hour, signups: 0 })) };
beforeEach(() => { vi.clearAllMocks(); state.authorize.mockResolvedValue(ADMIN); state.rpc.mockResolvedValue({ data: report, error: null }); });

it("returns sign-ups by first visit for an admin and the chosen period", async () => {
  const res = await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=30", { headers: { authorization: "Bearer t" } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toEqual(report);
  expect(state.rpc).toHaveBeenCalledWith("read_admin_signup_touches", { p_actor_app_user_id: ADMIN.appUserId, p_actor_admin_allowlist_id: ADMIN.allowlistId, p_days: 30 });
});
it("answers a period with no sign-ups", async () => {
  state.rpc.mockResolvedValueOnce({ data: empty, error: null });
  const res = await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=30"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(empty);
});
it("refuses a non-admin, an unknown period and hides database failures", async () => {
  state.authorize.mockRejectedValueOnce(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"));
  expect((await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=7"))).status).toBe(403);
  expect((await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=14"))).status).toBe(400);
  expect((await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=7&days=30"))).status).toBe(400);
  state.rpc.mockResolvedValueOnce({ data: null, error: { message: "active admin required" } });
  const failed = await GET(new Request("https://byus.test/api/admin/analytics/signup-touches?days=7"));
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: { code: "SIGNUP_TOUCHES_UNAVAILABLE" } });
});
