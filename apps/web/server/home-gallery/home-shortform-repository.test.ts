import { describe, expect, it, vi } from "vitest";
import { HomeGalleryRepository } from "./home-gallery-repository";

vi.mock("server-only", () => ({}));

describe("home shortform", () => {
  it("reads public creator videos without requiring a LIVE page", async () => {
    const video = { id: "10000000-0000-4000-8000-000000000001", videoId: "U8YzMfHLFQM", title: "원문 제목", creator: { slug: "nchive", name: "엔카이브" }, href: "https://www.youtube.com/watch?v=U8YzMfHLFQM" };
    const thumbnail = "/api/public/notice-media/20000000-0000-4000-8000-000000000002?variant=thumbnail";
    const rpc = vi.fn().mockResolvedValueOnce({ data: [video], error: null }).mockResolvedValue({ data: { [video.href]: thumbnail }, error: null });
    const repo = new HomeGalleryRepository({ rpc } as never);
    expect(await repo.listShorts("ko", { limit: 6 })).toEqual([{ ...video, platform: "youtube", thumbnail }]);
    expect(rpc).toHaveBeenCalledWith("read_public_home_shortform", { p_locale: "ko", p_limit: 6 });
  });
  it("reads a TikTok short made from a creator's notice (real read_public_home_shortform response, 20261222150000)", async () => {
    const sql = [{ id: "a1657945-3803-4c89-a7f4-24504cb8681a", href: "https://www.tiktok.com/@fixture.one/video/7000000000000000001", title: "원문 캡션 고침", creator: { name: "정제니", slug: "jenny-jeong" }, videoId: "7000000000000000001", platform: "tiktok" }];
    const repo = new HomeGalleryRepository({ rpc: vi.fn().mockResolvedValueOnce({ data: sql, error: null }).mockResolvedValue({ data: {}, error: null }) } as never);
    expect(await repo.listShorts("ko", { limit: 6 })).toEqual(sql);
    const mismatched = [{ ...sql[0], href: "https://www.tiktok.com/@fixture.one/video/7000000000000000002" }];
    await expect(new HomeGalleryRepository({ rpc: vi.fn().mockResolvedValue({ data: mismatched, error: null }) } as never).listShorts("ko", { limit: 6 })).rejects.toThrow();
  });
  it("reads a later page without treating a failed read as an empty page", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { items: [], hasMore: false }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    const repo = new HomeGalleryRepository({ rpc } as never);
    expect(await repo.listShortsPage("en", { offset: 12, limit: 12 })).toEqual({ items: [], hasMore: false });
    expect(rpc).toHaveBeenCalledWith("read_public_home_shortform_page", { p_locale: "en", p_offset: 12, p_limit: 12 });
    await expect(repo.listShortsPage("en", { offset: 0, limit: 12 })).rejects.toThrow();
  });
});
