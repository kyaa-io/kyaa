import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cached: vi.fn(async () => "cached"), invalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: () => mocks.cached, revalidateTag: mocks.invalidate }));
import { hostingCache } from "./hosting-cache";
import { publicContentCacheHeaders } from "./public-content-cache";
import { invalidatePublicContentCache } from "./public-content-revalidation";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("bypasses per-task caches and Vercel tags on AWS", async () => {
  vi.stubEnv("HOSTING_PROVIDER", "aws");
  const loader = vi.fn(async () => "fresh");
  expect(await hostingCache(loader, [], { revalidate: 30 })()).toBe("fresh");
  expect(mocks.cached).not.toHaveBeenCalled();
  expect(publicContentCacheHeaders()).toEqual({ "cache-control": "no-store" });
  invalidatePublicContentCache();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
it("preserves Vercel cache behavior", async () => {
  vi.stubEnv("HOSTING_PROVIDER", "vercel");
  expect(await hostingCache(async () => "fresh")()).toBe("cached");
});
