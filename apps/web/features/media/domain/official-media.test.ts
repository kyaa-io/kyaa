import { expect, it } from "vitest";
import { noticeMedia } from "./official-media";

it("uses the post title for photos without promoting accessibility descriptions into titles", () => {
  const items = noticeMedia({
    id: "10000000-0000-4000-8000-000000000001", slug: "source-post", title: "Cooking class with @loccitane 🍊🍪",
    pinned: false, kind: "standard", postType: "artist_post", visibility: "public", revision: 1, publishedAt: "2026-10-14T13:48:43Z",
    body: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/photo.jpg", alt: "앞치마를 입고 쿠키 반죽을 준비하는 엘리나" } }] },
  }, "elina");
  expect(items[0].title).toBe("Cooking class with @loccitane 🍊🍪");
});
