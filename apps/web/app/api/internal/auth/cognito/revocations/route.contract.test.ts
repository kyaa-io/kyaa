import { afterEach, expect, it, vi } from "vitest";
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/cognito/config", () => ({ cognitoCleanupConfig: () => ({}) }));
vi.mock("@/server/auth/cognito/browser-session", () => ({ authHeaders: () => new Headers({ "cache-control": "no-store" }), retryRemoteRevocations: retry }));
import { POST } from "./route";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("rejects unauthenticated retry requests before touching credentials", async () => {
 vi.stubEnv("CRON_SECRET", "s".repeat(32));
 expect((await POST(new Request("https://dev.kyaa.io/api/internal/auth/cognito/revocations", { method: "POST" }))).status).toBe(401);
 expect(retry).not.toHaveBeenCalled();
});
it("returns only retry counts to the existing cron credential", async () => {
 vi.stubEnv("CRON_SECRET", "s".repeat(32)); retry.mockResolvedValue({ attempted: 2, pending: 1 });
 const response = await POST(new Request("https://dev.kyaa.io/api/internal/auth/cognito/revocations", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` } }));
 expect(response.status).toBe(200); expect(await response.json()).toEqual({ attempted: 2, pending: 1 });
});
it("redacts storage failures", async () => {
 vi.stubEnv("CRON_SECRET", "s".repeat(32)); retry.mockRejectedValue(new Error("private refresh token"));
 const response = await POST(new Request("https://dev.kyaa.io/api/internal/auth/cognito/revocations", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` } }));
 expect(response.status).toBe(503); expect(await response.text()).not.toContain("private refresh token");
});
