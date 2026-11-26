import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
import { readUnlistedCreatorSlugs, readUnverifiedCreators } from "./unlisted-creators";

it("reads the unlisted slugs and refuses an odd answer", async () => {
  const rpc = vi.fn(async () => ["doc261107-test-ranking", "p1-smoke-creator"]);
  expect(await readUnlistedCreatorSlugs(rpc)).toEqual(["doc261107-test-ranking", "p1-smoke-creator"]);
  expect(rpc).toHaveBeenCalledWith("list_unlisted_creator_slugs", {});
  await expect(readUnlistedCreatorSlugs(async () => [1])).rejects.toThrow();
});

it("reads the fan-made (Unverified) pages from the database answer and treats a failed read as none", async () => {
  // list_unverified_creators() on the local DB after 20270116070200 with one approved fan page request.
  const answer = [{ id: "7e570000-0000-4000-8000-000000001126", slug: "fan-made-1126" }];
  const read = await readUnverifiedCreators(async () => answer);
  expect([...read.ids]).toEqual([answer[0]!.id]);
  expect([...read.slugs]).toEqual(["fan-made-1126"]);
  const failed = await readUnverifiedCreators(async () => { throw new Error("function public.list_unverified_creators() does not exist"); });
  expect(failed.ids.size + failed.slugs.size).toBe(0);
});
