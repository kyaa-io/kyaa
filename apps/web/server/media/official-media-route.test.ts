import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createOfficialMediaHandler } from "./official-media-route";
import { readExternalVideoThumbnail } from "./external-video-thumbnail";
vi.mock("./external-video-thumbnail", () => ({ readExternalVideoThumbnail: vi.fn(async () => null) }));
const id = "10000000-0000-4000-8000-000000000001", asset = "20000000-0000-4000-8000-000000000002";
const notice = { id, slug: "official-post", title: "Official", pinned: false, kind: "standard", postType: "artist_post", visibility: "members", revision: 1, publishedAt: "2026-09-01T00:00:00Z" };
const rpc = vi.fn(), authorize = vi.fn(async (token: string | null) => { if (token !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED",401,"invalid"); return { appUserId: id }; });
const run = createOfficialMediaHandler({ rpc, authorize });
beforeEach(() => { rpc.mockReset(); authorize.mockClear(); vi.mocked(readExternalVideoThumbnail).mockReset().mockResolvedValue(null); });
it("resolves a notice video's real cover only after the notice is authorized", async () => {
  const href = "https://www.instagram.com/reel/DeRosgtTOQo/", image = "https://scontent.cdninstagram.com/cover.jpg";
  rpc.mockResolvedValueOnce({ notices: [notice], hasMore: false }).mockResolvedValueOnce({ ...notice, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "가을 메이크업", marks: [{ type: "link", attrs: { href } }] }] }] } });
  vi.mocked(readExternalVideoThumbnail).mockResolvedValue(image);
  const response = await run(new Request("https://byus.test/api"), "elina");
  expect((await response.json()).items[0]).toMatchObject({ href, image, kind: "videos" });
  expect(readExternalVideoThumbnail).toHaveBeenCalledWith(href);
  rpc.mockResolvedValueOnce({ notices: [notice], hasMore: false }).mockResolvedValueOnce(null);
  vi.mocked(readExternalVideoThumbnail).mockClear();
  await run(new Request("https://byus.test/api"), "elina");
  expect(readExternalVideoThumbnail).not.toHaveBeenCalled();
});
it("returns the two verified TikTok covers without depending on oEmbed availability", async () => {
  const ids = ["7690854938997558549", "7689367463607192852"];
  rpc.mockResolvedValueOnce({ notices: [notice], hasMore: false }).mockResolvedValueOnce({ ...notice, body: { type: "doc", content: [{ type: "paragraph", content: ids.map(id => ({ type: "text", text: "이퓨 영상", marks: [{ type: "link", attrs: { href: `https://www.tiktok.com/@ifewknow/video/${id}` } }] })) }] } });
  const data = await (await run(new Request("https://byus.test/api"), "ifewknow")).json();
  expect(data.items.map((item: { image: string }) => item.image)).toEqual(ids.map(id => `/images/media/tiktok/${id}.jpg`));
  expect(readExternalVideoThumbnail).not.toHaveBeenCalled();
});
it("reauthorizes every notice, returns only private asset IDs, filters channel links, and keeps pagination", async () => {
  rpc.mockResolvedValueOnce({ notices: [notice], hasMore: true }).mockResolvedValueOnce({ ...notice, body: { type: "doc", content: [
    { type: "image", attrs: { src: `/api/content-assets/${asset}`, alt: "Photo" } },
    { type: "paragraph", content: [{ type: "text", text: "Video", marks: [{ type: "link", attrs: { href: "https://www.youtube.com/watch?v=abcdefghijk" } }] }, { type: "text", text: "Channel", marks: [{ type: "link", attrs: { href: "https://www.youtube.com/@creator" } }] }] },
  ] } });
  const response = await run(new Request("https://byus.test/api?locale=en", { headers: { authorization: "Bearer valid" } }), "artist");
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const data = await response.json(); expect(data.items).toHaveLength(2); expect(data.items[0]).toMatchObject({ image: null, asset: { id: asset }, href: "/c/artist/notices/official-post" }); expect(data.items[1].kind).toBe("videos"); expect(data.nextCursor).toBeTruthy();
  expect(rpc).toHaveBeenLastCalledWith("read_fan_notice", { p_app_user_id: id, p_slug: "artist", p_notice_slug: "official-post", p_locale: "en" });
});
it("removes content revoked between list and detail and rejects invalid supplied auth", async () => {
  rpc.mockResolvedValueOnce({ notices: [notice], hasMore: false }).mockResolvedValueOnce(null);
  expect(await (await run(new Request("https://byus.test/api"), "artist")).json()).toEqual({ items: [], nextCursor: null });
  rpc.mockClear(); expect((await run(new Request("https://byus.test/api", { headers: { authorization: "Bearer bad" } }), "artist")).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
});
it.each([true, false])("continues a media page with the notice pinned boundary %s", async pinned => {
  const firstNotice = { ...notice, pinned };
  const nextNotice = { ...notice, id: "30000000-0000-4000-8000-000000000003", slug: "next-post", publishedAt: pinned ? "2026-09-20T00:00:00Z" : "2026-08-20T00:00:00Z" };
  rpc.mockResolvedValueOnce({ notices: [firstNotice], hasMore: true }).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ notices: [nextNotice], hasMore: false }).mockResolvedValueOnce({ ...nextNotice, body: { type: "doc", content: [{ type: "image", attrs: { src: `/api/content-assets/${asset}`, alt: "Next photo" } }] } });
  const first = await (await run(new Request("https://byus.test/api?locale=en", { headers: { authorization: "Bearer valid" } }), "artist")).json();
  expect(first.items).toEqual([]);
  expect(JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"))).toEqual({ at: firstNotice.publishedAt, id, pinned });
  const second = await run(new Request(`https://byus.test/api?locale=en&cursor=${first.nextCursor}`, { headers: { authorization: "Bearer valid" } }), "artist");
  expect(second.status).toBe(200);
  expect(rpc).toHaveBeenNthCalledWith(1, "read_fan_notices", { p_app_user_id: id, p_slug: "artist", p_locale: "en", p_before: null, p_before_id: null, p_limit: 10, p_before_pinned: null });
  expect(rpc).toHaveBeenNthCalledWith(3, "read_fan_notices", { p_app_user_id: id, p_slug: "artist", p_locale: "en", p_before: firstNotice.publishedAt, p_before_id: id, p_limit: 10, p_before_pinned: pinned });
  expect(await second.json()).toMatchObject({ items: [{ title: "Next photo", date: nextNotice.publishedAt, href: "/c/artist/notices/next-post" }], nextCursor: null });
});
