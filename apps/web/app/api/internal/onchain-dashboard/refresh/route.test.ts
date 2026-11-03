import { afterEach, expect, it, vi } from "vitest";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/server/onchain/dashboard-snapshot", () => ({ refreshDashboardSnapshot: refresh }));
import { GET, maxDuration } from "./route";
const request = (signal?: AbortSignal, version = "1") => new Request("https://example.test", { signal, headers: { authorization: `Bearer ${"s".repeat(32)}`, "x-byus-onchain-stream": version } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("rejects missing, short and incorrect secrets before doing any work", async () => {
  for (const secret of [undefined, "short", "s".repeat(32)]) {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await GET(new Request("https://example.test"))).status).toBe(401);
  }
  expect(refresh).not.toHaveBeenCalled();
});
it("rejects old cron clients before starting work or sending a success header", async () => {
  vi.stubEnv("CRON_SECRET", "s".repeat(32));
  for (const version of ["", "2"]) expect((await GET(request(undefined, version))).status).toBe(409);
  expect(refresh).not.toHaveBeenCalled();
});
it("uses the extended budget and returns completion only after authenticated refresh", async () => {
  vi.stubEnv("CRON_SECRET", "s".repeat(32)); refresh.mockResolvedValue({ updated: true });
  const result = await GET(request());
  expect(maxDuration).toBe(570); expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ updated: true });
  expect(result.headers.get("cache-control")).toBe("no-store, no-transform");
  expect(result.headers.get("content-encoding")).toBe("identity");
});
it("flushes valid JSON whitespace immediately and every ten seconds before completion", async () => {
  vi.useFakeTimers(); vi.stubEnv("CRON_SECRET", "s".repeat(32));
  let finish!: (result: { updated: boolean }) => void;
  refresh.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const response = await GET(request()), reader = response.body!.getReader(), decoder = new TextDecoder();
  const first = decoder.decode((await reader.read()).value); expect(first).toBe(" ");
  await vi.advanceTimersByTimeAsync(10000);
  const heartbeat = decoder.decode((await reader.read()).value); expect(heartbeat).toBe("\n");
  finish({ updated: true });
  const final = decoder.decode((await reader.read()).value);
  expect(JSON.parse(first+heartbeat+final)).toEqual({ updated: true });
  expect((await reader.read()).done).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("returns a redacted body error after streaming headers and cleans up", async () => {
  vi.useFakeTimers(); vi.stubEnv("CRON_SECRET", "s".repeat(32)); refresh.mockRejectedValue(new Error("private RPC URL"));
  const result = await GET(request());
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ error: { code: "ONCHAIN_DASHBOARD_UNAVAILABLE" } });
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts verification and stops heartbeats when the consumer cancels", async () => {
  vi.useFakeTimers(); vi.stubEnv("CRON_SECRET", "s".repeat(32)); let signal: AbortSignal | undefined;
  refresh.mockImplementation((_deps, s: AbortSignal) => { signal = s; return new Promise((_resolve,reject) => s.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); });
  const result = await GET(request()); await result.body!.cancel(); await Promise.resolve();
  expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("closes the body when the request aborts even if the reader has not cancelled", async () => {
  vi.useFakeTimers(); vi.stubEnv("CRON_SECRET", "s".repeat(32));
  refresh.mockImplementation((_deps, signal: AbortSignal) => new Promise((_resolve,reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })));
  const controller = new AbortController(), result = await GET(request(controller.signal)); controller.abort();
  expect(await result.text()).toBe(" "); expect(vi.getTimerCount()).toBe(0);
});
