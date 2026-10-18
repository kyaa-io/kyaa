import { expect, it, vi } from "vitest";
import { readExternalVideoThumbnail } from "./external-video-thumbnail";
vi.mock("server-only", () => ({}));

const reel = "https://www.instagram.com/reel/DeRosgtTOQo/";
const image = "https://scontent.cdninstagram.com/video.jpg?a=1&b=2";
it("uses TikTok's official oEmbed cover and keeps rate limiting as an unavailable image", async () => {
  const href = "https://www.tiktok.com/@ifewknow/video/7690854938997558549", cover = "https://p16.tiktokcdn.com/cover.jpeg";
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ thumbnail_url: cover })).mockResolvedValueOnce(new Response("blocked", { status: 429 }));
  expect(await readExternalVideoThumbnail(href, fetcher)).toBe(cover);
  expect(String(fetcher.mock.calls[0][0])).toBe(`https://www.tiktok.com/oembed?url=${encodeURIComponent(href)}`);
  expect(await readExternalVideoThumbnail(href, fetcher)).toBeNull();
});
it("recovers the actual Instagram cover from its canonical public embed", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(`<img class="EmbeddedMediaImage" src="${image.replaceAll("&", "&amp;")}">`, { headers: { "content-type": "text/html" } }));
  expect(await readExternalVideoThumbnail(reel, fetcher)).toBe(image);
  expect(fetcher).toHaveBeenCalledWith("https://www.instagram.com/reel/DeRosgtTOQo/embed/", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
});
it.each(["https://instagram.com.evil.test/reel/abc/", "http://www.instagram.com/reel/abc/", "https://www.instagram.com@localhost/reel/abc/", "https://www.instagram.com:8443/reel/abc/", "https://www.instagram.com/@profile", "https://www.instagram.com/reel/abc/?token=secret"])("does not fetch an unsafe or non-canonical link %s", async href => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await readExternalVideoThumbnail(href, fetcher)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["https://evil.test/image.jpg", "https://cdninstagram.com.evil.test/image.jpg", "https://user:pass@scontent.cdninstagram.com/image.jpg", "http://scontent.cdninstagram.com/image.jpg"])("rejects an untrusted thumbnail %s", async src => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(`<img class="EmbeddedMediaImage" src="${src}">`, { headers: { "content-type": "text/html" } }));
  expect(await readExternalVideoThumbnail(reel, fetcher)).toBeNull();
});
it("keeps unavailable and oversized upstream responses recoverable", async () => {
  for (const response of [new Response("blocked", { status: 429 }), new Response("x".repeat(600_000)), new Response("<html>login</html>"), new Response("", { headers: { "content-length": "600000" } })]) {
    expect(await readExternalVideoThumbnail(reel, vi.fn<typeof fetch>().mockResolvedValue(response))).toBeNull();
  }
  expect(await readExternalVideoThumbnail(reel, vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")))).toBeNull();
});
