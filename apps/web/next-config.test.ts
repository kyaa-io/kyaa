import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return (await import("./next.config")).default;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("next.config experimental switches", () => {
  it("keeps the default without either variable", async () => {
    expect((await load({ NEXT_BUILD_CACHE: "", NEXT_DEV_FS_CACHE: "" })).experimental).toBeUndefined();
  });
  it("turns the dev file-system cache off only for NEXT_DEV_FS_CACHE=0", async () => {
    expect((await load({ NEXT_BUILD_CACHE: "", NEXT_DEV_FS_CACHE: "0" })).experimental).toEqual({ turbopackFileSystemCacheForDev: false });
    expect((await load({ NEXT_BUILD_CACHE: "", NEXT_DEV_FS_CACHE: "1" })).experimental).toBeUndefined();
  });
  it("merges both switches instead of one overwriting the other", async () => {
    expect((await load({ NEXT_BUILD_CACHE: "1", NEXT_DEV_FS_CACHE: "0" })).experimental).toEqual({ turbopackFileSystemCacheForBuild: true, turbopackFileSystemCacheForDev: false });
  });
});
