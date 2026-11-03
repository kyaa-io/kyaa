import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerformanceHandler } from "./performance-route";
import { logWebVital, logHomeQuery } from "./performance-logger";

vi.mock("server-only", () => ({}));
// Keep the real bounded reader without loading unrelated certification storage.
vi.mock("../certification/certification-repository", () => ({ CertificationRepositoryError: class extends Error {} }));
const metric = { name: "LCP", value: 1234, routeKind: "home" };
const request = (body: unknown = metric, headers: Record<string, string> = {}) => new Request("https://kyaa.io/api/analytics/performance", {
  method: "POST", headers: { origin: "https://kyaa.io", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.stubEnv("HOSTING_PROVIDER", "aws");
  vi.stubEnv("APP_URL", "https://kyaa.io");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("performance endpoint boundary", () => {
  it("logs a validated anonymous metric and never the request context", async () => {
    const log = vi.fn();
    const response = await createPerformanceHandler(log)(request(metric, { authorization: "Bearer private", cookie: "session=private" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(log).toHaveBeenCalledExactlyOnceWith(metric);
  });

  it("requires AWS, same origin, and JSON", async () => {
    const log = vi.fn();
    const handle = createPerformanceHandler(log);
    expect((await handle(request(metric, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await handle(request(metric, { origin: "" }))).status).toBe(403);
    expect((await handle(request(metric, { "content-type": "text/plain" }))).status).toBe(415);
    vi.stubEnv("HOSTING_PROVIDER", "vercel");
    expect((await handle(request())).status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });

  it.each(["kyaa.io", "www.kyaa.io", "byus.kr", "www.byus.kr"])("accepts trusted forwarded production alias %s", async (host) => {
    const log = vi.fn();
    const response = await createPerformanceHandler(log)(new Request("http://origin-alb.internal/api/analytics/performance", {
      method: "POST", headers: { origin: `https://${host}`, "x-forwarded-host": host, "x-forwarded-proto": "https", "content-type": "application/json" }, body: JSON.stringify(metric),
    }));
    expect(response.status).toBe(204);
    expect(log).toHaveBeenCalledExactlyOnceWith(metric);
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.test", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" },
    { origin: "https://kyaa.io", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" },
    { origin: "https://byus.kr", "x-forwarded-host": "kyaa.io", "x-forwarded-proto": "https" },
    { origin: "https://kyaa.io", "x-forwarded-host": "kyaa.io", "x-forwarded-proto": "http" },
    { origin: "https://kyaa.io", "x-forwarded-host": "kyaa.io@evil.test", "x-forwarded-proto": "https" },
    { origin: "https://kyaa.io", "x-forwarded-host": "kyaa.io", "x-forwarded-proto": "https", "sec-fetch-site": "cross-site" },
  ])("rejects spoofed forwarded headers or cross-site origins: %j", async (headers) => {
    const log = vi.fn();
    expect((await createPerformanceHandler(log)(new Request("http://origin-alb.internal/api/analytics/performance", {
      method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(metric),
    }))).status).toBe(403);
    expect(log).not.toHaveBeenCalled();
  });

  it("uses runtime APP_URL on AWS and restricts staging to its configured origin", async () => {
    vi.stubEnv("APP_URL", "https://staging.kyaa.io");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://kyaa.io");
    const log = vi.fn();
    const handle = createPerformanceHandler(log);
    expect((await handle(request())).status).toBe(403);
    expect((await handle(new Request("http://origin-alb.internal/api/analytics/performance", {
      method: "POST", headers: { origin: "https://staging.kyaa.io", "x-forwarded-host": "staging.kyaa.io", "x-forwarded-proto": "https", "content-type": "application/json" }, body: JSON.stringify(metric),
    }))).status).toBe(204);
    vi.stubEnv("APP_URL", undefined);
    expect((await handle(request())).status).toBe(403);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...metric, url: "/private" }, { ...metric, sessionId: "private" }, { ...metric, userId: "private" },
    { ...metric, name: "private" }, { ...metric, routeKind: "/my" }, { ...metric, value: -1 },
    { ...metric, value: "1" }, { ...metric, value: 3_600_001 }, { ...metric, value: null },
    { ...metric, name: "CLS", value: 101 },
  ])("rejects extra fields and invalid values: %j", async (body) => {
    const log = vi.fn();
    expect((await createPerformanceHandler(log)(request(body))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("bounds actual streamed bytes despite an absent or false content-length", async () => {
    const handle = createPerformanceHandler(vi.fn());
    const headerVariants: Record<string, string>[] = [{}, { "content-length": "1" }];
    for (const headers of headerVariants) {
      expect((await handle(request({ payload: "x".repeat(513) }, headers))).status).toBe(413);
    }
    expect((await handle(new Request("https://kyaa.io/api/analytics/performance", {
      method: "POST", headers: { origin: "https://kyaa.io", "content-type": "application/json" }, body: '{"name":"LCP","value":1e999,"routeKind":"home"}',
    }))).status).toBe(400);
  });

  it("suppresses logger exceptions without leaking errors", async () => {
    expect((await createPerformanceHandler(() => { throw new Error("secret"); })(request())).status).toBe(204);
    const info = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger unavailable"); });
    expect(() => logWebVital({ name: "CLS", value: 0.1, routeKind: "home" })).not.toThrow();
    expect(() => logHomeQuery({ name: "celebrities", durationMs: 1, outcome: "success" })).not.toThrow();
    expect(info).toHaveBeenCalledTimes(2);
  });
});
