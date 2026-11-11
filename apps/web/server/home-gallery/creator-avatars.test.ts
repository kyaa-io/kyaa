import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCreatorAvatarReader } from "./creator-avatars";
import type { PublishedContentRepository } from "@/server/content/published-content-repository";

const repository = (find: (slug: string) => unknown) => ({ findBySlug: vi.fn(async (_locale: string, slug: string) => find(slug)) }) as unknown as PublishedContentRepository & { findBySlug: ReturnType<typeof vi.fn> };

it("returns each creator's profile image once per slug and keeps only the profile photo binding", async () => {
  const repo = repository(slug => slug === "a" ? { image: { url: "/images/a.jpg", photos: { profile: { assetId: "x" }, landscape: { assetId: "y" } } } } : slug === "b" ? { image: { url: "/images/b.jpg" } } : null);
  const read = createCreatorAvatarReader(() => repo);
  const found = await read("ko", ["a", "b", "none"]);
  expect(found.a?.src).toBe("/images/a.jpg");
  expect(Object.keys(found.a?.photos ?? {})).toEqual(["profile"]);
  expect(found.b).toEqual({ src: "/images/b.jpg" });
  expect(found.none).toBeUndefined();
  await read("ko", ["a", "b"]);
  expect(repo.findBySlug).toHaveBeenCalledTimes(3);
});

it("leaves a creator on the default icon when the read fails", async () => {
  const read = createCreatorAvatarReader(() => ({ findBySlug: async () => { throw new Error("down"); } }) as unknown as PublishedContentRepository);
  expect(await read("ko", ["a"])).toEqual({});
});
