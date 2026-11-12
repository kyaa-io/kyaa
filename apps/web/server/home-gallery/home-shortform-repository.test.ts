import { describe, expect, it, vi } from "vitest";
import { HomeGalleryRepository } from "./home-gallery-repository";

vi.mock("server-only", () => ({}));

const video = (index: number, slug: string, videoId = `video${String(index).padStart(6, "0")}`.slice(0, 11).padEnd(11, "x")) => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, videoId, title: `원문 제목 ${index}`, creator: { slug, name: slug }, href: `https://www.youtube.com/watch?v=${videoId}` });
/** The page read answers newest first by offset, like read_public_home_shortform_page. */
const pageRpc = (list: ReturnType<typeof video>[]) => vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number; p_hrefs?: string[] }) => {
  if (name === "read_public_video_thumbnails") return { data: {}, error: null };
  const offset = args.p_offset ?? 0, limit = args.p_limit ?? 12;
  return { data: { items: list.slice(offset, offset + limit), hasMore: list.length > offset + limit }, error: null };
});

describe("home shortform", () => {
  it("uses public reaction totals to rank every creator's visible shorts", async () => {
    const list = [video(1, "a"), video(2, "b")];
    const rpc = vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number; p_video_id?: string }) => {
      if (name === "read_public_video_thumbnails") return { data: {}, error: null };
      if (name === "read_shortform_participation") return { data: { likeCount: args.p_video_id === list[1]!.videoId ? 4 : 1 }, error: null };
      const offset = args.p_offset ?? 0, limit = args.p_limit ?? 12;
      return { data: { items: list.slice(offset, offset + limit), hasMore: false }, error: null };
    });
    const catalog = await new HomeGalleryRepository({ rpc } as never).listShortsCatalog("ko");
    expect(catalog.items).toHaveLength(2);
    expect(catalog.likes).toEqual({ [list[0]!.videoId]: 1, [list[1]!.videoId]: 4 });
    expect(rpc).toHaveBeenCalledWith("read_shortform_participation", { p_video_id: list[0]!.videoId, p_app_user_id: null });
  });
  it("reads public creator videos without requiring a LIVE page, with the cover the site stored", async () => {
    const one = video(1, "nchive", "U8YzMfHLFQM");
    const thumbnail = "/api/public/notice-media/20000000-0000-4000-8000-000000000002?variant=thumbnail";
    const rpc = vi.fn(async (name: string) => name === "read_public_video_thumbnails" ? { data: { [one.href]: thumbnail }, error: null } : { data: { items: [one], hasMore: false }, error: null });
    expect(await new HomeGalleryRepository({ rpc } as never).listShorts("ko", { limit: 6 })).toEqual([{ ...one, platform: "youtube", thumbnail }]);
    expect(rpc).toHaveBeenCalledWith("read_public_home_shortform_page", { p_locale: "ko", p_offset: 0, p_limit: 12 });
  });
  it("reads a TikTok short made from a creator's notice (real read_public_home_shortform response, 20261222150000)", async () => {
    const sql = [{ id: "a1657945-3803-4c89-a7f4-24504cb8681a", href: "https://www.tiktok.com/@fixture.one/video/7000000000000000001", title: "원문 캡션 고침", creator: { name: "정제니", slug: "jenny-jeong" }, videoId: "7000000000000000001", platform: "tiktok" }];
    const ok = vi.fn(async (name: string) => name === "read_public_video_thumbnails" ? { data: {}, error: null } : { data: { items: sql, hasMore: false }, error: null });
    expect(await new HomeGalleryRepository({ rpc: ok } as never).listShorts("ko", { limit: 6 })).toEqual(sql);
    const mismatched = [{ ...sql[0], href: "https://www.tiktok.com/@fixture.one/video/7000000000000000002" }];
    await expect(new HomeGalleryRepository({ rpc: vi.fn().mockResolvedValue({ data: { items: mismatched, hasMore: false }, error: null }) } as never).listShorts("ko", { limit: 6 })).rejects.toThrow();
  });
  it("lets creators take turns even when one creator posted the newest forty (사용자 2026-11-12)", async () => {
    const list = [...Array.from({ length: 40 }, (_, i) => video(i, "elina")), ...["yuna", "changha", "hiroro", "minju"].flatMap((slug, s) => [0, 1, 2].map(n => video(100 + s * 3 + n, slug)))];
    const repo = new HomeGalleryRepository({ rpc: pageRpc(list) } as never);
    const firstTwelve = await repo.listShorts("ko", { limit: 12 });
    expect(new Set(firstTwelve.map(item => item.creator.slug)).size).toBe(5);
    firstTwelve.slice(1).forEach((item, i) => expect(item.creator.slug).not.toBe(firstTwelve[i]!.creator.slug));
    expect(firstTwelve.filter(item => item.creator.slug === "elina").length).toBeLessThanOrEqual(3);
  });
  it("pages by position in the diversified list, without repeats, and tells when the list ends", async () => {
    const list = ["a", "b", "c"].flatMap((slug, s) => Array.from({ length: 8 }, (_, i) => video(s * 20 + i, slug)));
    const repo = new HomeGalleryRepository({ rpc: pageRpc(list) } as never);
    const first = await repo.listShortsPage("en", { offset: 0, limit: 12 }), second = await repo.listShortsPage("en", { offset: 12, limit: 12 }), third = await repo.listShortsPage("en", { offset: 24, limit: 12 });
    expect(first.hasMore).toBe(true); expect(second.hasMore).toBe(false); expect(third).toEqual({ items: [], hasMore: false });
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(24);
  });
  it("does not treat a failed read as an empty page", async () => {
    const repo = new HomeGalleryRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }) } as never);
    await expect(repo.listShortsPage("en", { offset: 0, limit: 12 })).rejects.toThrow();
  });
});

describe("home gallery pool", () => {
  it("reads the newest three pages in parallel and continues after them", async () => {
    const photo = (i: number) => ({ id: `n${i}:0`, source: "official_sns", image: { url: "https://example.com/a.jpg", width: 4, height: 5 }, alt: "alt", creator: { slug: "a", name: "a" } });
    const rpc = vi.fn(async (_: string, args: { p_offset: number }) => ({ data: { items: Array.from({ length: 24 }, (_, i) => photo(args.p_offset + i)), hasMore: true }, error: null }));
    const page = await new HomeGalleryRepository({ rpc } as never).listPublishedPool("ko", { pages: 3 });
    expect(page.items).toHaveLength(72);
    expect(rpc.mock.calls.map(call => (call[1] as { p_offset: number }).p_offset).sort((a, b) => a - b)).toEqual([0, 24, 48]);
    expect(page.nextCursor).not.toBeNull();
  });
});
