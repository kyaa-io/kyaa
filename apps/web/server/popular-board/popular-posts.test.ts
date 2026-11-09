import { describe, expect, it, vi } from "vitest";
import { createGetPublicPopularPosts } from "./popular-posts";

vi.mock("server-only", () => ({}));

const empty = { items: [], hasMore: false };
const make = (groupsEnabled: boolean) => {
  const rpc = vi.fn(async () => empty);
  const authorize = vi.fn(async () => ({ appUserId: "11111111-1111-4111-8111-111111111111" }));
  const handler = createGetPublicPopularPosts({ rpc, authorize } as never, { groupsEnabled });
  return { rpc, authorize, handler };
};

describe("popular posts route", () => {
  it("asks for group posts when the groups feature is on", async () => {
    const { rpc, handler } = make(true);
    expect((await handler(new Request("http://x/api/public/popular-posts?locale=ko&page=2"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_public_popular_posts_page", { p_app_user_id: null, p_locale: "ko", p_page: 2, p_include_groups: true });
  });

  it("excludes group posts in the query itself when the groups feature is off", async () => {
    const { rpc, handler } = make(false);
    expect((await handler(new Request("http://x/api/public/popular-posts"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_public_popular_posts_page", { p_app_user_id: null, p_locale: "ko", p_page: 1, p_include_groups: false });
  });

  it("keeps the viewer id and the flag together for signed-in readers", async () => {
    const { rpc, handler } = make(false);
    await handler(new Request("http://x/api/public/popular-posts?locale=en", { headers: { authorization: "Bearer t" } }));
    expect(rpc).toHaveBeenCalledWith("read_public_popular_posts_page", { p_app_user_id: "11111111-1111-4111-8111-111111111111", p_locale: "en", p_page: 1, p_include_groups: false });
  });
});

describe("popular posts page pictures", () => {
  const row = (source: "fan" | "group", pageRef: string) => ({ source, id: "a9600000-0000-4000-8000-000000000001", pageRef, pageName: pageRef, title: "글", nickname: "팬", createdAt: "2026-11-09T00:00:00Z", likeCount: 1, commentCount: 0, viewCount: null, asset: null });
  it("adds each page's picture to its rows, once per page, and leaves rows of pages without one as they are", async () => {
    const rpc = vi.fn(async () => ({ hasMore: false, items: [row("fan", "elina"), row("fan", "elina"), row("group", "g1")] }));
    const pageImage = vi.fn(async (_source: string, ref: string) => ref === "elina" ? "https://x/elina.webp" : null);
    const handler = createGetPublicPopularPosts({ rpc, authorize: vi.fn() } as never, { groupsEnabled: true, pageImage });
    const body = await (await handler(new Request("http://x/api/public/popular-posts"))).json();
    expect(pageImage).toHaveBeenCalledTimes(2);
    expect(body.items.map((item: { pageImageUrl?: string }) => item.pageImageUrl)).toEqual(["https://x/elina.webp", "https://x/elina.webp", undefined]);
  });
  it("still answers when a page's picture cannot be read", async () => {
    const rpc = vi.fn(async () => ({ hasMore: false, items: [row("fan", "elina")] }));
    const handler = createGetPublicPopularPosts({ rpc, authorize: vi.fn() } as never, { groupsEnabled: true, pageImage: async () => { throw new Error("down"); } });
    expect((await handler(new Request("http://x/api/public/popular-posts"))).status).toBe(200);
  });
});
