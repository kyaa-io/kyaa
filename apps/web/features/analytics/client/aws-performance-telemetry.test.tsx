import { afterEach, describe, expect, it, vi } from "vitest";
import { createPerformanceReporter } from "./aws-performance-telemetry";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("AWS anonymous Web Vitals", () => {
  it("sends only a fixed category and numeric metric without credentials or referrer", () => {
    window.history.replaceState({}, "", "/benefits/public-id?token=secret#private");
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    createPerformanceReporter()({ name: "LCP", value: 1200 });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/analytics/performance", {
      method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ name: "LCP", value: 1200, routeKind: "public-detail" }),
    });
  });

  it("rechecks delayed metrics after private SPA navigation and caps at ten sends", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetcher);
    const report = createPerformanceReporter();
    window.history.replaceState({}, "", "/my?userId=secret");
    report({ name: "LCP", value: 10 });
    expect(fetcher).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
    for (let count = 0; count < 15; count += 1) report({ name: "LCP", value: 10 });
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it("excludes private initial loads and unsampled documents", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Math, "random").mockReturnValue(0);
    window.history.replaceState({}, "", "/login");
    const report = createPerformanceReporter();
    window.history.replaceState({}, "", "/");
    report({ name: "LCP", value: 10 });
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    createPerformanceReporter()({ name: "LCP", value: 10 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores invalid numbers, unknown metrics and transport failures", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const report = createPerformanceReporter();
    report({ name: "URL", value: 1 });
    report({ name: "LCP", value: Infinity });
    report({ name: "CLS", value: 101 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => report({ name: "LCP", value: 10 })).not.toThrow();
    await Promise.resolve();
    fetcher.mockImplementation(() => { throw new Error("blocked"); });
    expect(() => report({ name: "LCP", value: 10 })).not.toThrow();
  });
});
