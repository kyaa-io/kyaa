import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "../../features/auth/domain/auth-errors";
import { funnelAnalyticsSchema } from "../../features/analytics/domain/funnel-analytics";
import { webAnalyticsSchema } from "../../features/analytics/domain/web-analytics";
import { SupabaseLedgerAnalyticsRepository } from "./ledger-analytics-repository";
import { createGetAdminLedgerReportHandler } from "./web-analytics-route";

const admin = {
  appUserId: "11111111-1111-4111-8111-111111111111",
  allowlistId: "22222222-2222-4222-8222-222222222222",
  email: "admin@example.invalid",
  role: "admin" as const,
};

// Captured from read_admin_web_traffic / read_admin_funnel_analytics on the local database (20261219010000),
// session time zone Asia/Seoul, so timestamps carry +09:00 and microseconds as PostgREST returns them.
const sqlWebTraffic = {"to": "2026-11-09T09:00:00+09:00", "days": 7, "from": "2026-11-02T09:00:00+09:00", "trend": [{"date": "2026-11-02", "visitors": 0, "pageviews": 0}, {"date": "2026-11-03", "visitors": 0, "pageviews": 0}, {"date": "2026-11-04", "visitors": 0, "pageviews": 0}, {"date": "2026-11-05", "visitors": 0, "pageviews": 0}, {"date": "2026-11-06", "visitors": 0, "pageviews": 0}, {"date": "2026-11-07", "visitors": 0, "pageviews": 0}, {"date": "2026-11-08", "visitors": 1, "pageviews": 1}], "totals": {"visitors": 1, "pageviews": 1}, "fetchedAt": "2026-11-08T22:11:43.370645+09:00", "breakdowns": {"pages": [{"label": "community", "visitors": 1, "pageviews": 1}], "devices": [{"label": "mobile", "visitors": 1, "pageviews": 1}], "browsers": [{"label": "instagram", "visitors": 1, "pageviews": 1}], "referrers": [{"label": "social", "visitors": 1, "pageviews": 1}], "operatingSystems": [{"label": "ios", "visitors": 1, "pageviews": 1}]}};
const sqlFunnel = {"to": "2026-11-09T09:00:00+09:00", "days": 30, "from": "2026-10-10T09:00:00+09:00", "steps": {"visitors": 1, "fanVerified": 120, "firstActivity": 76, "accountCreated": 207}, "pageViewsSince": "2026-11-08T22:11:43.369917+09:00"};
const sqlEmptyFunnel = { ...sqlFunnel, days: 7, from: "2026-11-02T09:00:00+09:00", pageViewsSince: null, steps: { visitors: 0, fanVerified: 0, firstActivity: 0, accountCreated: 0 } };

function rpcReturning(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) };
}

describe("ledger analytics repository", () => {
  it("accepts the real SQL payloads and passes the admin to the database", async () => {
    const web = rpcReturning(sqlWebTraffic);
    await expect(new SupabaseLedgerAnalyticsRepository(web).webTraffic({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days: 7 }))
      .resolves.toEqual(webAnalyticsSchema.parse(sqlWebTraffic));
    expect(web.rpc).toHaveBeenCalledWith("read_admin_web_traffic", { p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId, p_days: 7 });
    const funnel = rpcReturning(sqlFunnel);
    await expect(new SupabaseLedgerAnalyticsRepository(funnel).funnel({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days: 30 }))
      .resolves.toEqual(funnelAnalyticsSchema.parse(sqlFunnel));
    expect(funnelAnalyticsSchema.safeParse(sqlEmptyFunnel).success).toBe(true);
  });
  it("rejects database errors, other periods and unknown labels", async () => {
    const input = { adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days: 7 as const };
    await expect(new SupabaseLedgerAnalyticsRepository(rpcReturning(null, { message: "active admin required" })).funnel(input)).rejects.toThrow();
    await expect(new SupabaseLedgerAnalyticsRepository(rpcReturning(sqlFunnel)).funnel(input)).rejects.toThrow();
    const withPath = { ...sqlWebTraffic, breakdowns: { ...sqlWebTraffic.breakdowns, pages: [{ label: "/my/settings?x=1", visitors: 1, pageviews: 1 }] } };
    await expect(new SupabaseLedgerAnalyticsRepository(rpcReturning(withPath)).webTraffic(input)).rejects.toThrow();
  });
});

describe("admin ledger report route", () => {
  const setup = (read = vi.fn(async () => sqlWebTraffic)) => ({
    read,
    handler: createGetAdminLedgerReportHandler({ authorize: vi.fn(async () => admin), read, unavailableCode: "WEB_ANALYTICS_UNAVAILABLE" }),
  });
  it("returns the report privately for a valid period", async () => {
    const { handler, read } = setup();
    const response = await handler(new Request("https://kyaa.test/api/admin/analytics/web?days=30"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(read).toHaveBeenCalledWith({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days: 30 });
  });
  it.each(["days=14", "days=7&days=30", "days=7&x=1", "days=07"])("rejects %s", async (query) => {
    const { handler, read } = setup();
    expect((await handler(new Request(`https://kyaa.test/x?${query}`))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("maps auth failures and hides database failures", async () => {
    const denied = createGetAdminLedgerReportHandler({ authorize: vi.fn(async () => { throw new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "no"); }), read: vi.fn(), unavailableCode: "X" });
    expect((await denied(new Request("https://kyaa.test/x"))).status).toBe(403);
    const { handler } = setup(vi.fn(async () => { throw new Error("db down with secret"); }));
    const response = await handler(new Request("https://kyaa.test/x?days=7"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "WEB_ANALYTICS_UNAVAILABLE" } });
  });
});
