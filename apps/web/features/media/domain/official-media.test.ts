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

const photoNotice = (title: string) => ({
  id: "10000000-0000-4000-8000-000000000002", slug: "photos", title, pinned: false, kind: "standard" as const, postType: "notice" as const, visibility: "public" as const, revision: 1, publishedAt: "2026-11-06T00:00:00Z",
  body: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/photo.jpg", alt: title } }] },
});

it("leaves a photo without text when the post title is only the source account handle", () => {
  expect(noticeMedia(photoNotice("@rororhuiro"), "any-creator")[0].title).toBe("");
  expect(noticeMedia(photoNotice("@mmnoo.s"), "other-creator")[0].title).toBe("");
});

it("keeps every title that carries more than a single handle", () => {
  for (const title of ["진짜 연말 •• ♥", "@our.own.hour @rakuz.beauty", "Cooking class with @loccitane", "@elina 사진"]) {
    expect(noticeMedia(photoNotice(title), "any-creator")[0].title).toBe(title);
  }
});
