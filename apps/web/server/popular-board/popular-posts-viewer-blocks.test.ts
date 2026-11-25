import { afterEach, describe, expect, it, vi } from "vitest";
import { type PopularPostCache, createGetPublicPopularPosts } from "./popular-posts";

vi.mock("server-only", () => ({}));

const viewer = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `a9600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({ source: "fan" as const, id: id(n), pageRef: "p", pageName: "p", title: `글 ${n}`, nickname: "팬", createdAt: "2026-11-09T00:00:00Z", likeCount: 100 - n, commentCount: 0, viewCount: null, asset: null });
// `total` ranked posts in the shared list, 10 per page.
const sharedPage = (page: number, total: number) => ({ hasMore: page * 10 < total, items: Array.from({ length: Math.max(0, Math.min(10, total - (page - 1) * 10)) }, (_, index) => row((page - 1) * 10 + index + 1)) });

const make = (blocked: number[], blockRead?: () => unknown, total = 25) => {
  const cache: PopularPostCache = new Map();
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_public_popular_posts_period") {
      const page = sharedPage(args.p_page as number, total);
      return args.p_app_user_id === null ? page : { ...page, items: page.items.filter(item => !blocked.map(id).includes(item.id)) };
    }
    if (name === "popular_post_blocked_keys") return blockRead ? blockRead() : blocked.map(n => `fan:${id(n)}`).filter(key => (args.p_fan_post_ids as string[]).includes(key.slice(4)));
    return {};
  });
  const handler = createGetPublicPopularPosts({ rpc, authorize: vi.fn(async () => ({ appUserId: viewer })) } as never, { groupsEnabled: true, publicCache: cache });
  const read = async (page: number, signedIn = true) => (await handler(new Request(`http://x/api/public/popular-posts?page=${page}`, signedIn ? { headers: { authorization: "Bearer t" } } : {}))).json() as Promise<{ hasMore: boolean; items: { id: string }[] }>;
  const listCalls = () => rpc.mock.calls.filter(([name]) => name === "read_public_popular_posts_period").map(([, args]) => args as { p_app_user_id: string | null; p_page: number });
  return { rpc, read, listCalls };
};
const numbers = (body: { items: { id: string }[] }) => body.items.map(item => Number(item.id.slice(-12)));

afterEach(() => vi.useRealTimers());

describe("popular posts for signed-in readers", () => {
  it("removes a blocked writer's post from the cached list and refills the page from the next rank", async () => {
    const { read, listCalls } = make([3]);
    await read(1, false);
    const body = await read(1);
    expect(numbers(body)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(body.hasMore).toBe(true);
    expect(listCalls().every(call => call.p_app_user_id === null)).toBe(true);
    // Page 1 came from the cache the anonymous read filled; only page 2 was read to refill.
    expect(listCalls().map(call => call.p_page)).toEqual([1, 2]);
  });

  it("keeps page boundaries after removal so no post is skipped or shown twice", async () => {
    const { read } = make([3, 12]);
    const pages = [await read(1), await read(2), await read(3)];
    expect(pages.flatMap(numbers)).toEqual(Array.from({ length: 25 }, (_, index) => index + 1).filter(n => n !== 3 && n !== 12));
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false]);
  });

  it("matches the reader's own ranked list for every page", async () => {
    const blocked = [1, 2, 10, 11, 20];
    const own = make(blocked);
    for (const page of [1, 2, 3]) {
      const expected = Array.from({ length: 25 }, (_, index) => index + 1).filter(n => !blocked.includes(n)).slice((page - 1) * 10, page * 10);
      expect(numbers(await own.read(page))).toEqual(expected);
    }
  });

  it("shows anonymous readers the same cached list without a block read", async () => {
    const { rpc, read } = make([3]);
    expect(numbers(await read(1, false))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rpc.mock.calls.some(([name]) => name === "popular_post_blocked_keys")).toBe(false);
  });

  it("reads the shared list again after 60 seconds", async () => {
    vi.useFakeTimers();
    const { read, listCalls } = make([]);
    await read(1);
    vi.advanceTimersByTime(59_000);
    await read(1);
    expect(listCalls()).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    await read(1);
    expect(listCalls()).toHaveLength(2);
  });

  it("answers from the reader's own ranked list when the block read is missing", async () => {
    const { read, listCalls } = make([3], () => { throw new Error("missing function"); });
    // The stub's own list drops blocked rows from the same page without refilling.
    expect(numbers(await read(1))).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10]);
    expect(listCalls().at(-1)).toMatchObject({ p_app_user_id: viewer, p_page: 1 });
  });

  it("answers from the reader's own ranked list when blocks empty more than the refill pages", async () => {
    const { read, listCalls } = make(Array.from({ length: 32 }, (_, index) => index + 1), undefined, 40);
    await read(1);
    expect(listCalls().map(call => [call.p_app_user_id, call.p_page])).toEqual([[null, 1], [null, 2], [null, 3], [viewer, 1]]);
  });

  it("uses the shared rows when blocks empty the end of the list", async () => {
    const { read, listCalls } = make(Array.from({ length: 22 }, (_, index) => index + 1));
    const body = await read(1);
    expect(numbers(body)).toEqual([23, 24, 25]);
    expect(body.hasMore).toBe(false);
    expect(listCalls().every(call => call.p_app_user_id === null)).toBe(true);
  });

  it("reads deep pages from the reader's own ranked list", async () => {
    const { read, listCalls } = make([]);
    await read(6);
    expect(listCalls()).toEqual([expect.objectContaining({ p_app_user_id: viewer, p_page: 6 })]);
  });
});
