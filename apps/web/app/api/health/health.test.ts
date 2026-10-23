import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ env: vi.fn((): { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string } => ({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "secret" })) }));
vi.mock("../../../server/config/env", () => ({ loadServerEnv: mocks.env }));
import { GET as live } from "./live/route";
import { GET as ready } from "./ready/route";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("liveness does not access dependencies", async () => {
  expect(await live().json()).toEqual({ status: "ok" });
  expect(mocks.env).not.toHaveBeenCalled();
});
it("reports only a validated immutable release revision", async () => {
  vi.stubEnv("RELEASE_SHA", "a".repeat(40));
  expect(await live().json()).toEqual({ status: "ok", revision: "a".repeat(40) });
  vi.stubEnv("RELEASE_SHA", "not-a-commit");
  expect(await live().json()).toEqual({ status: "ok" });
});
it("checks Supabase with a bounded read and never caches", async () => {
  const fetcher = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", fetcher);
  const response = await ready();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetcher).toHaveBeenCalledWith(new URL("https://db.example/rest/v1/app_users?select=id&limit=0"), expect.objectContaining({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) }));
});
it("uses the configured PostgREST sidecar", async () => {
  vi.stubEnv("POSTGREST_URL", "http://127.0.0.1:3001");
  vi.stubEnv("POSTGREST_SERVICE_TOKEN", "sidecar-secret");
  const fetcher = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", fetcher);
  expect((await ready()).status).toBe(200);
  expect(fetcher).toHaveBeenCalledWith(new URL("http://127.0.0.1:3001/app_users?select=id&limit=0"), expect.objectContaining({ headers: { authorization: "Bearer sidecar-secret" } }));
});
it("returns only a generic failure on dependency errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret"); }));
  const response = await ready();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
it("rejects incomplete PostgREST configuration without a request", async () => {
  vi.stubEnv("POSTGREST_URL", "http://127.0.0.1:3001");
  vi.stubEnv("POSTGREST_SERVICE_TOKEN", "");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await ready()).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});

it("can check the AWS sidecar without legacy credentials and fails closed without any database", async () => {
  mocks.env.mockReturnValueOnce({});
  vi.stubEnv("POSTGREST_URL", "http://127.0.0.1:3001"); vi.stubEnv("POSTGREST_SERVICE_TOKEN", "sidecar-secret");
  const fetcher = vi.fn(async () => new Response("[]")); vi.stubGlobal("fetch", fetcher);
  expect((await ready()).status).toBe(200);
  expect(fetcher).toHaveBeenCalledWith(new URL("http://127.0.0.1:3001/app_users?select=id&limit=0"), expect.objectContaining({ headers: { authorization: "Bearer sidecar-secret" } }));
  mocks.env.mockReturnValueOnce({}); vi.stubEnv("POSTGREST_URL", undefined); vi.stubEnv("POSTGREST_SERVICE_TOKEN", undefined); fetcher.mockClear();
  expect((await ready()).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
