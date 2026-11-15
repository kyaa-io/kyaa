import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const { provider, client } = vi.hoisted(() => ({ provider: vi.fn(() => null), client: vi.fn() }));
vi.mock("@/server/mobile-settings/push-providers", () => ({ createPlatformPushProviderFromEnvironment: provider }));
vi.mock("@/server/data/client", () => ({ createClient: client }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("reports missing configuration before claiming deliveries", async () => {
 vi.stubEnv("CRON_SECRET", "s".repeat(32));
 const response = await GET(new Request("https://kyaa.test", {headers:{authorization:`Bearer ${"s".repeat(32)}`}}));
 expect(response.status).toBe(503);
 expect(await response.json()).toMatchObject({configured:false,error:{code:"MOBILE_PUSH_NOT_CONFIGURED"},retryable:false});
 expect(client).not.toHaveBeenCalled(); expect(provider).toHaveBeenCalledOnce();
});
