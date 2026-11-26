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
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_public_popular_posts_period", { p_app_user_id: null, p_locale: "ko", p_page: 2, p_include_groups: true, p_sort: "likes", p_period: "week" });
  });

  it("excludes group posts in the query itself when the groups feature is off", async () => {
    const { rpc, handler } = make(false);
    expect((await handler(new Request("http://x/api/public/popular-posts"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_public_popular_posts_period", { p_app_user_id: null, p_locale: "ko", p_page: 1, p_include_groups: false, p_sort: "likes", p_period: "week" });
  });

  it("passes the selected sort to the database and rejects invalid sorts", async () => {
    const { rpc, handler } = make(true);
    expect((await handler(new Request("http://x/api/public/popular-posts?sort=views"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_public_popular_posts_period", expect.objectContaining({ p_sort: "views" }));
    expect((await handler(new Request("http://x/api/public/popular-posts?sort=latest"))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_public_popular_posts_period", expect.objectContaining({ p_sort: "latest" }));
    expect((await handler(new Request("http://x/api/public/popular-posts?sort=unknown"))).status).toBe(400);
    expect((await handler(new Request("http://x/api/public/popular-posts?sort=views&sort=likes"))).status).toBe(400);
  });

  it("passes and validates the selected time window", async () => {
    const { rpc, handler } = make(true);
    expect((await handler(new Request("http://x/api/public/popular-posts?period=today"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("read_public_popular_posts_period", expect.objectContaining({ p_period: "today" }));
    expect((await handler(new Request("http://x/api/public/popular-posts?period=month"))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("read_public_popular_posts_period", expect.objectContaining({ p_period: "month" }));
    expect((await handler(new Request("http://x/api/public/popular-posts?period=bad"))).status).toBe(400);
    expect((await handler(new Request("http://x/api/public/popular-posts?period=today&period=week"))).status).toBe(400);
  });

  it("reads the shared list with the flag for signed-in readers and checks the sign-in", async () => {
    const { rpc, authorize, handler } = make(false);
    await handler(new Request("http://x/api/public/popular-posts?locale=en", { headers: { authorization: "Bearer t" } }));
    expect(authorize).toHaveBeenCalledWith("Bearer t");
    expect(rpc).toHaveBeenCalledWith("read_public_popular_posts_period", { p_app_user_id: null, p_locale: "en", p_page: 1, p_include_groups: false, p_sort: "likes", p_period: "week" });
  });
});

describe("popular posts writer pictures", () => {
  const fanId = "a9600000-0000-4000-8000-000000000001", groupId = "a9600000-0000-4000-8000-000000000002";
  const row = (source: "fan" | "group", id: string) => ({ source, id, pageRef: "p", pageName: "p", title: "글", nickname: "팬", createdAt: "2026-11-09T00:00:00Z", likeCount: 1, commentCount: 0, viewCount: null, asset: null });
  const list = { hasMore: false, items: [row("fan", fanId), row("group", groupId)] };
  it("adds each writer's picture to its row from one read, and leaves a row without an answer as it is", async () => {
    const rpc = vi.fn(async (name: string) => name === "public_post_author_avatars" ? { [`fan:${fanId}`]: "/images/avatars/heart-pink.webp" } : list);
    const body = await (await createGetPublicPopularPosts({ rpc, authorize: vi.fn() } as never, { groupsEnabled: true })(new Request("http://x/api/public/popular-posts"))).json();
    expect(rpc).toHaveBeenCalledWith("public_post_author_avatars", { p_fan_post_ids: [fanId], p_group_post_ids: [groupId] });
    expect(body.items.map((item: { avatarUrl?: string }) => item.avatarUrl)).toEqual(["/images/avatars/heart-pink.webp", undefined]);
  });
  it("still answers, without pictures, when they cannot be read or are not public avatar addresses", async () => {
    for (const answer of [() => { throw new Error("missing"); }, () => ({ [`fan:${fanId}`]: "https://elsewhere/x.png" })]) {
      const rpc = vi.fn(async (name: string) => name === "public_post_author_avatars" ? answer() : list);
      const response = await createGetPublicPopularPosts({ rpc, authorize: vi.fn() } as never, { groupsEnabled: true })(new Request("http://x/api/public/popular-posts"));
      expect(response.status).toBe(200);
      expect((await response.json()).items.every((item: { avatarUrl?: string }) => item.avatarUrl === undefined)).toBe(true);
    }
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
    expect(body.items.map((item: { pageImageUrl?: string }) => item.pageImageUrl)).toEqual(["https://x/elina.webp", undefined]);
  });
  it("still answers when a page's picture cannot be read", async () => {
    const rpc = vi.fn(async () => ({ hasMore: false, items: [row("fan", "elina")] }));
    const handler = createGetPublicPopularPosts({ rpc, authorize: vi.fn() } as never, { groupsEnabled: true, pageImage: async () => { throw new Error("down"); } });
    expect((await handler(new Request("http://x/api/public/popular-posts"))).status).toBe(200);
  });
});

it('deduplicates stable source and post ID while preserving distinct posts with the same title',async()=>{
 const row={source:'fan',id:'a9600000-0000-4000-8000-000000000001',pageRef:'elina',pageName:'elina',title:'같은 제목',nickname:'팬',createdAt:'2026-11-09T00:00:00Z',likeCount:1,commentCount:0,viewCount:1,asset:null};
 const rpc=vi.fn(async()=>({hasMore:false,items:[row,{...row,viewCount:2},{...row,id:'a9600000-0000-4000-8000-000000000002'},{...row,source:'group'}]}));
 const handler=createGetPublicPopularPosts({rpc,authorize:vi.fn()} as never,{groupsEnabled:true});
 const body=await(await handler(new Request('https://x/api/public/popular-posts'))).json();
 expect(body.items).toHaveLength(3);expect(body.items[0].viewCount).toBe(1);
});

describe("fan-made (Unverified) pages on the home board", () => {
  it("leaves out posts of a fan-made creator page and keeps group posts and official pages", async () => {
    const row = (source: "fan" | "group", id: string, pageRef: string) => ({ source, id, pageRef, pageName: pageRef, title: "글", nickname: "팬", createdAt: "2026-11-09T00:00:00Z", likeCount: 1, commentCount: 0, viewCount: null, asset: null });
    const rpc = vi.fn(async () => ({ items: [row("fan", "a9600000-0000-4000-8000-000000000001", "fan-made"), row("fan", "a9600000-0000-4000-8000-000000000002", "elina"), row("group", "a9600000-0000-4000-8000-000000000003", "fan-made")], hasMore: false }));
    const handler = createGetPublicPopularPosts({ rpc, authorize: vi.fn(), unverifiedCreators: async () => ({ ids: new Set<string>(), slugs: new Set(["fan-made"]) }) } as never, { groupsEnabled: true });
    const body = await (await handler(new Request("http://x/api/public/popular-posts"))).json();
    expect(body.items.map((item: { source: string; pageRef: string }) => `${item.source}:${item.pageRef}`)).toEqual(["fan:elina", "group:fan-made"]);
  });
});
