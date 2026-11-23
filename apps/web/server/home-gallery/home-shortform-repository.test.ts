import { describe, expect, it, vi } from "vitest";
import { decodeHomeGalleryCursor, encodeHomeGalleryCursor, HomeGalleryRepository } from "./home-gallery-repository";

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
    const rpc = vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number; p_video_ids?: string[] }) => {
      if (name === "read_public_video_thumbnails") return { data: {}, error: null };
      if (name === "read_public_shortform_like_counts") return { data: { [list[0]!.videoId]: 1, [list[1]!.videoId]: 4 }, error: null };
      const offset = args.p_offset ?? 0, limit = args.p_limit ?? 12;
      return { data: { items: list.slice(offset, offset + limit), hasMore: false }, error: null };
    });
    const catalog = await new HomeGalleryRepository({ rpc } as never).listShortsCatalog("ko");
    expect(catalog.items).toHaveLength(2);
    expect(catalog.likes).toEqual({ [list[0]!.videoId]: 1, [list[1]!.videoId]: 4 });
    expect(rpc).toHaveBeenCalledWith("read_public_shortform_like_counts", { p_video_ids: [list[0]!.videoId, list[1]!.videoId] });
    expect(rpc).not.toHaveBeenCalledWith("read_shortform_participation", expect.anything());
  });
  it("reads the like totals of a real SQL answer: a public video with likes, one without, and a hidden creator's video left out", async () => {
    const answer = (await import("./fixtures/read_public_shortform_like_counts.json")).default;
    expect(answer).toEqual({ sv000000004: 4, sv000000009: 0 });
    const list = ["sv000000004", "sv000000009", "sv000001201"].map((videoId, index) => video(index + 1, "a", videoId));
    const rpc = vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number }) => {
      if (name === "read_public_video_thumbnails") return { data: {}, error: null };
      if (name === "read_public_shortform_like_counts") return { data: answer, error: null };
      return { data: { items: list.slice(args.p_offset ?? 0, (args.p_offset ?? 0) + (args.p_limit ?? 12)), hasMore: false }, error: null };
    });
    expect((await new HomeGalleryRepository({ rpc } as never).listShortsCatalog("ko")).likes).toEqual({ sv000000004: 4, sv000000009: 0, sv000001201: 0 });
  });
  it.each([12, 120, 1200])("reads the like totals of %i videos in a few bounded batches, with the same likes and order as one read per video", async (count) => {
    const list = Array.from({ length: count }, (_, i) => video(i + 1, ["a", "b", "c"][i % 3]!));
    const expected = (videoId: string) => Number(videoId.slice(5)) % 17;
    let running = 0, peak = 0;
    const batches: string[][] = [];
    const rpc = vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number; p_video_ids?: string[] }) => {
      if (name === "read_public_video_thumbnails") return { data: {}, error: null };
      if (name === "read_public_shortform_like_counts") {
        batches.push(args.p_video_ids!);
        running += 1; peak = Math.max(peak, running);
        await new Promise(resolve => setTimeout(resolve, 5));
        running -= 1;
        return { data: Object.fromEntries(args.p_video_ids!.map(id => [id, expected(id)])), error: null };
      }
      const offset = args.p_offset ?? 0, limit = args.p_limit ?? 12;
      return { data: { items: list.slice(offset, offset + limit), hasMore: list.length > offset + limit }, error: null };
    });
    const catalog = await new HomeGalleryRepository({ rpc } as never).listShortsCatalog("ko");
    expect(catalog.items.map(item => item.videoId)).toEqual(list.map(item => item.videoId));
    expect(catalog.likes).toEqual(Object.fromEntries(list.map(item => [item.videoId, expected(item.videoId)])));
    expect(rpc.mock.calls.filter(call => call[0] === "read_shortform_participation")).toHaveLength(0);
    expect(batches).toHaveLength(Math.ceil(count / 200));
    expect(batches.every(batch => batch.length <= 200)).toBe(true);
    expect(batches.flat().sort()).toEqual(list.map(item => item.videoId).sort());
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("counts a video the batch left out (not public) as 0 likes, and fails the whole catalog when a batch fails", async () => {
    const list = [video(1, "a"), video(2, "b")];
    const base = (likes: { data: unknown; error: unknown }) => vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number }) => {
      if (name === "read_public_video_thumbnails") return { data: {}, error: null };
      if (name === "read_public_shortform_like_counts") return likes;
      return { data: { items: list.slice(args.p_offset ?? 0, (args.p_offset ?? 0) + (args.p_limit ?? 12)), hasMore: false }, error: null };
    });
    expect((await new HomeGalleryRepository({ rpc: base({ data: { [list[1]!.videoId]: 3 }, error: null }) } as never).listShortsCatalog("ko")).likes).toEqual({ [list[0]!.videoId]: 0, [list[1]!.videoId]: 3 });
    await expect(new HomeGalleryRepository({ rpc: base({ data: null, error: { message: "unavailable" } }) } as never).listShortsCatalog("ko")).rejects.toThrow("unavailable");
    await expect(new HomeGalleryRepository({ rpc: base({ data: { [list[0]!.videoId]: -1 }, error: null }) } as never).listShortsCatalog("ko")).rejects.toThrow();
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
  it("mixes Instagram reels into the shorts and leaves out a reel that has no stored cover (real read_public_home_shortform_page shape, 20261229000000)", async () => {
    const reel = (index: number, slug: string, code: string) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`, platform: "instagram", videoId: code, title: `릴스 원문 ${index}`, creator: { slug, name: slug }, href: `https://www.instagram.com/${slug}/p/${code}/` });
    const covered = reel(1, "a", "AbCdEfGhIjK"), bare = reel(2, "b", "LmNoPqRsTuV");
    const list = [covered, bare, video(3, "c", "U8YzMfHLFQM")];
    const thumbnail = "/api/public/notice-media/20000000-0000-4000-8000-000000000009?variant=thumbnail";
    const rpc = vi.fn(async (name: string, args: { p_offset?: number; p_limit?: number }) => {
      if (name === "read_public_video_thumbnails") return { data: { [covered.href]: thumbnail }, error: null };
      const offset = args.p_offset ?? 0, limit = args.p_limit ?? 12;
      return { data: { items: list.slice(offset, offset + limit), hasMore: false }, error: null };
    });
    const shown = await new HomeGalleryRepository({ rpc } as never).listShorts("ko", { limit: 12 });
    expect(shown.map(item => item.videoId).sort()).toEqual(["AbCdEfGhIjK", "U8YzMfHLFQM"]);
    expect(shown.find(item => item.platform === "instagram")).toMatchObject({ title: "릴스 원문 1", href: covered.href, thumbnail });
    const page = await new HomeGalleryRepository({ rpc } as never).listShortsPage("ko", { offset: 0, limit: 12 });
    expect(page).toMatchObject({ hasMore: false });
    expect(page.items).toHaveLength(2);
  });
  it("keeps a YouTube or TikTok short without a stored cover (their platform cover is the fallback)", async () => {
    const rpc = pageRpc([video(1, "a", "U8YzMfHLFQM")]);
    expect(await new HomeGalleryRepository({ rpc } as never).listShorts("ko", { limit: 6 })).toHaveLength(1);
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
  const photo = (i: number) => ({ id: `n${i}:0`, source: "official_sns", image: { url: "https://example.com/a.jpg", width: 4, height: 5 }, alt: "alt", creator: { slug: "a", name: "a" } });
  const last = (i: number) => ({ rank: 2147483647, at: "2026-11-17T01:02:03.123456+00:00", id: `n${i}:0` });
  it("reads the newest three pages in parallel and continues after the last photo read", async () => {
    const rpc = vi.fn(async (_: string, args: { p_offset: number }) => ({ data: { items: Array.from({ length: 24 }, (_, i) => photo(args.p_offset + i)), hasMore: true, last: last(args.p_offset + 23) }, error: null }));
    const page = await new HomeGalleryRepository({ rpc } as never).listPublishedPool("ko", { pages: 3 });
    expect(page.items).toHaveLength(72);
    for (const [, args] of rpc.mock.calls) expect(args).toMatchObject({ p_mark_recent: true });
    expect(rpc.mock.calls.map(call => (call[1] as { p_offset: number }).p_offset).sort((a, b) => a - b)).toEqual([0, 24, 48]);
    expect(rpc.mock.calls.every(call => call[0] === "read_public_gallery_post_photos" && (call[1] as { p_offset: number; p_limit: number }).p_limit === 24)).toBe(true);
    expect(decodeHomeGalleryCursor(page.nextCursor!)).toEqual({ after: { rank: 2147483647, at: "2026-11-17T01:02:03.123456+00:00", id: "n71:0" } });
  });
  it("continues after the sort key of a cursor, and refuses a cursor it did not issue", async () => {
    const rpc = vi.fn(async () => ({ data: { items: [photo(30)], hasMore: false, last: last(30) }, error: null }));
    const repo = new HomeGalleryRepository({ rpc } as never);
    expect(await repo.listPublished("en", { limit: 24, cursor: encodeHomeGalleryCursor(last(23)) })).toEqual({ items: [photo(30)], nextCursor: null });
    expect(rpc).toHaveBeenCalledWith("read_public_gallery_post_photos", { p_include_groups: false, p_locale: "en", p_limit: 24, p_after_rank: 2147483647, p_after_at: "2026-11-17T01:02:03.123456+00:00", p_after_id: "n23:0" });
    await expect(repo.listPublished("en", { limit: 24, cursor: "bm9wZQ" })).rejects.toThrow(/cursor/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
