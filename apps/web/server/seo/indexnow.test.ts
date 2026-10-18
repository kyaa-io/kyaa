import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createIndexNowHandler, runIndexNow, validatePublicationSnapshot } from "./indexnow";

const first = "https://kyaa.io/elina?locale=ko";
const second = "https://kyaa.io/c/elina/raffles/fff318a6-24c7-4012-8290-3494a55e287c?locale=en";
const hash = "a".repeat(64);
function dependencies(previous: Record<string,string> = {}, current: Record<string,string> = { [first]: hash }) {
  return {
    store: { claim: vi.fn().mockResolvedValue(previous), acknowledge: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(undefined) },
    loadSnapshot: vi.fn().mockResolvedValue(current),
    transport: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  };
}

describe("IndexNow publication boundary", () => {
  it("sends changed and removed public URLs then acknowledges the entire snapshot", async () => {
    const deps = dependencies({ [first]: "b".repeat(64), [second]: hash });
    expect(await runIndexNow(deps)).toEqual({ status: "submitted", submitted: 2 });
    const [url, request] = deps.transport.mock.calls[0];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(request.redirect).toBe("error");
    expect(request.headers).toEqual({ "content-type": "application/json" });
    const body = JSON.parse(request.body);
    expect(body.host).toBe("kyaa.io");
    expect(body.urlList).toEqual([second, first].sort());
    expect(body.keyLocation).toBe(`https://kyaa.io/${body.key}.txt`);
    expect(deps.store.acknowledge).toHaveBeenCalledWith(expect.any(String), { [first]: hash });
    expect(deps.store.release).toHaveBeenCalledOnce();
  });
  it("does not notify unchanged snapshots or acquire concurrently held work", async () => {
    const deps = dependencies({ [first]: hash });
    expect(await runIndexNow(deps)).toEqual({ status: "unchanged", submitted: 0 });
    expect(deps.transport).not.toHaveBeenCalled();
    deps.store.claim.mockResolvedValueOnce(null);
    expect(await runIndexNow(deps)).toEqual({ status: "busy", submitted: 0 });
    expect(deps.loadSnapshot).toHaveBeenCalledOnce();
  });
  it.each([202, 200])("accepts only protocol success %s", async (status) => {
    const deps = dependencies(); deps.transport.mockResolvedValue(new Response(null, { status }));
    await runIndexNow(deps);
    expect(deps.store.acknowledge).toHaveBeenCalledOnce();
  });
  it.each([201, 403, 429, 500])("retains retry state on response %s", async (status) => {
    const deps = dependencies(); deps.transport.mockResolvedValue(new Response(null, { status }));
    await expect(runIndexNow(deps)).rejects.toThrow("INDEXNOW_REJECTED");
    expect(deps.store.acknowledge).not.toHaveBeenCalled();
    expect(deps.store.release).toHaveBeenCalledOnce();
  });
  it("does not turn query failure or an empty projection into mass URL removal", async () => {
    const deps = dependencies({ [first]: hash });
    deps.loadSnapshot.mockRejectedValueOnce(new Error("query failed"));
    await expect(runIndexNow(deps)).rejects.toThrow("query failed");
    deps.loadSnapshot.mockResolvedValueOnce({});
    await expect(runIndexNow(deps)).rejects.toThrow("INVALID_PUBLICATION_SNAPSHOT");
    expect(deps.transport).not.toHaveBeenCalled();
    expect(deps.store.acknowledge).not.toHaveBeenCalled();
  });
  it("fences expired workers and preserves retry state on network failure", async () => {
    const deps = dependencies(); deps.store.acknowledge.mockResolvedValueOnce(false);
    await expect(runIndexNow(deps)).rejects.toThrow("INDEXNOW_LEASE_EXPIRED");
    deps.transport.mockRejectedValueOnce(new Error("network failed"));
    await expect(runIndexNow(deps)).rejects.toThrow("network failed");
    expect(deps.store.release).toHaveBeenCalledTimes(2);
  });
  it("bounds batches and retains the whole prior snapshot if a later batch fails", async () => {
    const current = Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [`https://kyaa.io/creator-${i}?locale=ko`, hash]));
    const deps = dependencies({}, current);
    deps.transport.mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(runIndexNow(deps)).rejects.toThrow("INDEXNOW_REJECTED");
    expect(deps.transport.mock.calls.map(([, request]) => JSON.parse(request.body).urlList.length)).toEqual([10_000, 1]);
    expect(deps.store.acknowledge).not.toHaveBeenCalled();
    expect(deps.store.release).toHaveBeenCalledOnce();
  });
  it.each([
    "https://evil.example/elina?locale=ko", "https://kyaa.io/admin?locale=ko",
    "https://kyaa.io/c/elina/tickets?locale=en", "https://kyaa.io/elina?locale=ko&email=private",
    "https://kyaa.io/test-creator?locale=ko", "https://kyaa.io/elina?locale=xx",
    "https://kyaa.io/elina?locale=ko#private", "https://name:pass@kyaa.io/elina?locale=ko",
    "https://kyaa.io/c/elina/raffles/not-an-id?locale=ko", "https://kyaa.io/elina?locale=ko&locale=en",
  ])("rejects unsafe current or persisted URL %s", (url) => {
    expect(() => validatePublicationSnapshot({ [url]: hash })).toThrow("INVALID_PUBLICATION_SNAPSHOT");
  });
  it("rejects invalid digests and allows all supported static language URLs", () => {
    expect(() => validatePublicationSnapshot({ [first]: "raw private text" })).toThrow();
    expect(validatePublicationSnapshot({ "https://kyaa.io/guide?locale=zh-Hant": hash })).toEqual({ "https://kyaa.io/guide?locale=zh-Hant": hash });
  });
});

describe("IndexNow cron authorization", () => {
  const secret = "x".repeat(32);
  it("checks authorization and production before executing any DB/external work", async () => {
    const execute = vi.fn();
    const handler = createIndexNowHandler({ secret, production: true, execute });
    expect((await handler(new Request("https://kyaa.io/api/internal/seo/indexnow"))).status).toBe(401);
    const request = new Request("https://kyaa.io/api/internal/seo/indexnow", { headers: { authorization: `Bearer ${secret}` } });
    const preview = createIndexNowHandler({ secret, production: false, execute });
    expect((await preview(request)).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });
  it("returns only no-store counts or sanitized failure codes", async () => {
    const request = new Request("https://kyaa.io/api/internal/seo/indexnow", { headers: { authorization: `Bearer ${secret}` } });
    const execute = vi.fn().mockRejectedValueOnce(new Error("private value")).mockResolvedValueOnce({ status: "submitted", submitted: 3 });
    const handler = createIndexNowHandler({ secret, production: true, execute });
    const failure = await handler(request);
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private value");
    const success = await handler(request);
    expect(success.headers.get("cache-control")).toBe("no-store");
    expect(await success.json()).toEqual({ status: "submitted", submitted: 3 });
  });
});
