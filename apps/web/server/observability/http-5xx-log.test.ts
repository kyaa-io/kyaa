import { mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHttp5xxLogLine,
  buildHttpSlowLogLine,
  describeError,
  installHttp5xxLog,
  loadRouteMatchers,
  recordRequestError,
  requestIdFrom,
  resolveRouteTemplate,
  uninstallHttp5xxLogForTest,
} from "./http-5xx-log";

const manifest = {
  staticRoutes: [{ page: "/api/health/live", regex: "^/api/health/live(?:/)?$" }],
  dynamicRoutes: [{ page: "/api/groups/[groupId]/wallet", regex: "^/api/groups/([^/]+?)/wallet(?:/)?$" }],
};

function manifestFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "http-5xx-"));
  const file = path.join(dir, "routes-manifest.json");
  writeFileSync(file, JSON.stringify(manifest));
  return file;
}

describe("route template", () => {
  const matchers = loadRouteMatchers(manifestFile());

  it("maps concrete paths to the template and drops the query", () => {
    expect(resolveRouteTemplate("/api/groups/user-123/wallet?token=secret", matchers)).toBe("/api/groups/[groupId]/wallet");
    expect(resolveRouteTemplate("/api/health/live", matchers)).toBe("/api/health/live");
  });

  it("never echoes an unknown raw path", () => {
    expect(resolveRouteTemplate("/api/members/m-42/private", matchers)).toBe("(unmatched)");
  });

  it("returns no matchers when the manifest is missing", () => {
    expect(loadRouteMatchers("/nonexistent/routes-manifest.json")).toEqual([]);
  });
});

describe("error and request id fields", () => {
  it("keeps only short token-like name, code and digest, never the message", () => {
    const error = Object.assign(new TypeError("user kim@example.com not found"), { code: "23505", digest: "1234567" });
    expect(describeError(error)).toEqual({ name: "TypeError", code: "23505", digest: "1234567" });
    expect(describeError(Object.assign(new Error("x"), { code: "email kim@example.com" })).code).toBeNull();
    expect(describeError("boom")).toEqual({ name: "NonError", code: null, digest: null });
  });

  it("prefers the ALB trace id", () => {
    expect(requestIdFrom({ "x-amzn-trace-id": "Root=1-67891233-abcdef012345678912345678", "x-request-id": "r1" }))
      .toBe("Root=1-67891233-abcdef012345678912345678");
    expect(requestIdFrom({ "x-request-id": "r1" })).toBe("r1");
    expect(requestIdFrom({ "x-request-id": "<script>" })).toBeNull();
  });

  it("contains no headers, query or body fields", () => {
    const line = buildHttp5xxLogLine({
      url: "/api/groups/user-123/wallet?token=secret",
      method: "post",
      status: 500,
      headers: { authorization: "Bearer secret", cookie: "session=secret" },
      error: undefined,
      matchers: loadRouteMatchers(manifestFile()),
    });
    expect(Object.keys(line).sort()).toEqual(
      ["digest", "errorCode", "errorName", "event", "method", "requestId", "route", "source", "status"].sort(),
    );
    expect(JSON.stringify(line)).not.toMatch(/secret|user-123/);
    expect(line.method).toBe("POST");
  });
});

describe("installed on a real http server", () => {
  const originalEmit = http.Server.prototype.emit;
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    uninstallHttp5xxLogForTest(originalEmit as never);
  });

  async function start(handler: http.RequestListener): Promise<{ lines: string[]; base: string }> {
    const lines: string[] = [];
    installHttp5xxLog({ matchers: loadRouteMatchers(manifestFile()), write: (line) => lines.push(line) });
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return { lines, base: `http://127.0.0.1:${port}` };
  }

  async function settle(lines: string[], count: number) {
    for (let i = 0; i < 50 && lines.length < count; i += 1) await new Promise((r) => setTimeout(r, 10));
  }

  it("logs one line for an explicit 503 response and nothing for 2xx/4xx", async () => {
    const { lines, base } = await start((req, res) => {
      res.statusCode = req.url?.startsWith("/api/groups") ? 503 : req.url === "/api/health/live" ? 200 : 404;
      res.end("{}");
    });
    await fetch(`${base}/api/health/live`);
    await fetch(`${base}/missing`);
    await fetch(`${base}/api/groups/user-123/wallet?token=secret`, {
      method: "PATCH",
      headers: { "x-amzn-trace-id": "Root=1-abc", authorization: "Bearer secret" },
    });
    await settle(lines, 1);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      event: "http_5xx",
      route: "/api/groups/[groupId]/wallet",
      method: "PATCH",
      status: 503,
      source: "response",
      errorName: null,
      errorCode: null,
      digest: null,
      requestId: "Root=1-abc",
    });
    expect(lines[0]).not.toMatch(/secret|user-123/);
  });

  it("merges a thrown error recorded by onRequestError into the same single line", async () => {
    const { lines, base } = await start(async (_req, res) => {
      await Promise.resolve();
      const { onRequestError } = await import("../../instrumentation");
      process.env.NEXT_RUNTIME = "nodejs";
      await onRequestError(
        Object.assign(new RangeError("member 42 broke"), { code: "PGRST116" }),
        { path: "/api/groups/user-123/wallet", method: "GET", headers: {} },
        { routerKind: "App Router", routePath: "/api/groups/[groupId]/wallet", routeType: "route", renderSource: undefined, revalidateReason: undefined } as never,
      );
      delete process.env.NEXT_RUNTIME;
      res.statusCode = 500;
      res.end();
    });
    await fetch(`${base}/api/groups/user-123/wallet`);
    await settle(lines, 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      route: "/api/groups/[groupId]/wallet",
      status: 500,
      source: "thrown",
      errorName: "RangeError",
      errorCode: "PGRST116",
      requestId: null,
    });
    expect(lines[0]).not.toMatch(/member 42/);
  });

  it("wraps the server only once", async () => {
    installHttp5xxLog({ matchers: [], write: () => {} });
    const wrapped = http.Server.prototype.emit;
    installHttp5xxLog({ matchers: [], write: () => {} });
    expect(http.Server.prototype.emit).toBe(wrapped);
  });
});

describe("slow request line", () => {
  it("carries only the route template, method, status, duration, rsc flag and request id", () => {
    const line = buildHttpSlowLogLine({
      url: "/api/groups/user-123/wallet?token=secret&_rsc=abc",
      method: "get",
      status: 200,
      durationMs: 812.4,
      headers: { authorization: "Bearer secret", cookie: "session=secret", "x-amzn-trace-id": "Root=1-abc" },
      matchers: loadRouteMatchers(manifestFile()),
    });
    expect(line).toEqual({
      event: "http_slow", route: "/api/groups/[groupId]/wallet", method: "GET", status: 200, durationMs: 812, rsc: true, requestId: "Root=1-abc",
    });
    expect(JSON.stringify(line)).not.toMatch(/secret|user-123/);
  });

  it("never echoes an unknown raw path", () => {
    expect(buildHttpSlowLogLine({ url: "/members/m-42?x=1", method: "GET", status: 200, durationMs: 600, headers: {}, matchers: [] }).route).toBe("(unmatched)");
  });
});

describe("slow lines on a real http server", () => {
  const originalEmit = http.Server.prototype.emit;
  let server: http.Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    uninstallHttp5xxLogForTest(originalEmit as never);
  });

  it("logs a slow 2xx once, skips a fast one, and leaves a slow 5xx to the 5xx line", async () => {
    const lines: string[] = [];
    installHttp5xxLog({ matchers: loadRouteMatchers(manifestFile()), write: (line) => lines.push(line), slowMs: 60 });
    server = http.createServer((req, res) => {
      const delay = req.url?.includes("slow") ? 90 : 0;
      setTimeout(() => { res.statusCode = req.url?.includes("fail") ? 503 : 200; res.end("{}"); }, delay);
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await fetch(`${base}/api/health/live`);
    await fetch(`${base}/api/health/live?slow=1&token=secret`);
    await fetch(`${base}/api/groups/user-123/wallet?slow=1&fail=1`);
    for (let i = 0; i < 50 && lines.length < 2; i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(lines.map((line) => JSON.parse(line).event)).toEqual(["http_slow", "http_5xx"]);
    const slow = JSON.parse(lines[0]!);
    expect(slow).toMatchObject({ route: "/api/health/live", method: "GET", status: 200, rsc: false });
    expect(slow.durationMs).toBeGreaterThanOrEqual(60);
    expect(lines[0]).not.toMatch(/secret/);
  });
});
