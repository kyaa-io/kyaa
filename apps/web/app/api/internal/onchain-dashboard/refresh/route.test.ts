import { afterEach, expect, it, vi } from "vitest";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/server/onchain/dashboard-snapshot", () => ({ refreshDashboardSnapshot: refresh }));
import { GET, maxDuration } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("rejects missing, short and incorrect secrets before doing any work", async () => {
  for (const secret of [undefined, "short", "s".repeat(32)]) {
    vi.stubEnv("CRON_SECRET", secret);
    const result = await GET(new Request("https://example.test"));
    expect(result.status).toBe(401);
  }
  expect(refresh).not.toHaveBeenCalled();
});
it("uses the five-minute route budget and authenticated refresh", async () => {
  vi.stubEnv("CRON_SECRET", "s".repeat(32)); refresh.mockResolvedValue({ updated: true });
  const result = await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"s".repeat(32)}` } }));
  expect(maxDuration).toBe(300); expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ updated: true });
  expect(result.headers.get("cache-control")).toBe("no-store");
});
it("redacts refresh failures", async () => {
  vi.stubEnv("CRON_SECRET", "s".repeat(32)); refresh.mockRejectedValue(new Error("private RPC URL"));
  const result = await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"s".repeat(32)}` } }));
  expect(result.status).toBe(503); expect(await result.text()).not.toContain("private");
});
