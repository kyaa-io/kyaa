import { afterEach, describe, expect, it, vi } from "vitest";
const { processDelivery, createDependencies } = vi.hoisted(() => ({ processDelivery: vi.fn(), createDependencies: vi.fn(() => ({ rpc: vi.fn() })) }));
vi.mock("@/server/runmusic/telegram", () => ({ processRunmusicTelegram: processDelivery }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: createDependencies }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const request = (authorization?: string) => new Request("https://kyaa.test/api/internal/runmusic/telegram/process", { headers: authorization ? { authorization } : {} });
describe("Runmusic delivery cron", () => {
  it.each(["", "short"])("rejects an unconfigured or short secret before any work", async secret => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(401);
    expect(createDependencies).not.toHaveBeenCalled();
  });
  it("rejects missing/incorrect credentials before creating a database client", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    for (const auth of [undefined, "Bearer wrong", `Bearer ${"x".repeat(32)}`]) expect((await GET(request(auth))).status).toBe(401);
    expect(createDependencies).not.toHaveBeenCalled();
  });
  it("bounds recovery work and stops at the empty queue", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32)); processDelivery.mockResolvedValue("handled");
    expect(await (await GET(request(`Bearer ${"s".repeat(32)}`))).json()).toEqual({ handled: 3 });
    expect(processDelivery).toHaveBeenCalledTimes(3);
    processDelivery.mockClear().mockResolvedValue("idle");
    expect(await (await GET(request(`Bearer ${"s".repeat(32)}`))).json()).toEqual({ handled: 0 });
    expect(processDelivery).toHaveBeenCalledTimes(1);
  });
  it("does not reveal provider or database errors", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32)); processDelivery.mockRejectedValue(new Error("private-provider-token"));
    const response = await GET(request(`Bearer ${"s".repeat(32)}`));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-provider-token");
  });
});
