import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
import { readUnlistedCreatorSlugs } from "./unlisted-creators";

it("reads the unlisted slugs and refuses an odd answer", async () => {
  const rpc = vi.fn(async () => ["doc261107-test-ranking", "p1-smoke-creator"]);
  expect(await readUnlistedCreatorSlugs(rpc)).toEqual(["doc261107-test-ranking", "p1-smoke-creator"]);
  expect(rpc).toHaveBeenCalledWith("list_unlisted_creator_slugs", {});
  await expect(readUnlistedCreatorSlugs(async () => [1])).rejects.toThrow();
});
