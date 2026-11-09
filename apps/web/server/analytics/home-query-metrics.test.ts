import { afterEach, describe, expect, it, vi } from "vitest";
import { measureHomeQuery } from "./home-query-metrics";
import { logHomeQuery } from "./performance-logger";

vi.mock("server-only", () => ({}));
vi.mock("./performance-logger", () => ({ logHomeQuery: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("home query timing", () => {
  it("returns the exact result and logs only a label, duration, and outcome on AWS", async () => {
    vi.stubEnv("HOSTING_PROVIDER", "aws");
    const value = { privateData: "not logged" };
    expect(await measureHomeQuery("celebrities", async () => value)).toBe(value);
    expect(logHomeQuery).toHaveBeenCalledExactlyOnceWith({ name: "celebrities", durationMs: expect.any(Number), outcome: "success" });
  });

  it("preserves rejection and synchronous errors even when logging throws", async () => {
    vi.stubEnv("HOSTING_PROVIDER", "aws");
    vi.mocked(logHomeQuery).mockImplementation(() => { throw new Error("logger"); });
    const failure = new Error("private query error");
    await expect(measureHomeQuery("homeNotices", () => Promise.reject(failure))).rejects.toBe(failure);
    await expect(measureHomeQuery("homeNotices", () => { throw failure; })).rejects.toBe(failure);
    expect(logHomeQuery).toHaveBeenLastCalledWith({ name: "homeNotices", durationMs: expect.any(Number), outcome: "error" });
    expect(await measureHomeQuery("homeBanners", async () => "ok")).toBe("ok");
  });

  it("does not log outside AWS", async () => {
    vi.stubEnv("HOSTING_PROVIDER", "vercel");
    expect(await measureHomeQuery("elinaRaffles", async () => 42)).toBe(42);
    expect(logHomeQuery).not.toHaveBeenCalled();
  });
});
