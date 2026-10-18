import { describe, expect, it } from "vitest";
import { parseNoticeDocument, parseNoticeLocaleParams } from "./notice-domain";

describe("Notice locale query", () => {
  it("defaults to Korean and rejects invalid or duplicate values", () => {
    expect(parseNoticeLocaleParams(new URLSearchParams())).toBe("ko");
    expect(parseNoticeLocaleParams(new URLSearchParams("locale=en"))).toBe("en");
    expect(parseNoticeLocaleParams(new URLSearchParams("locale=fr"))).toBeNull();
    expect(parseNoticeLocaleParams(new URLSearchParams("locale=ko&locale=en"))).toBeNull();
  });
});

describe("Notice rich-text contract", () => {
  it("validates unsafe siblings after a meaningful first paragraph", () => {
    expect(() => parseNoticeDocument({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "valid" }] },
      { type: "image", attrs: { src: "javascript:alert(1)", alt: "image" } },
    ] })).toThrow();
    expect(() => parseNoticeDocument({ type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "valid" }, { type: "text", text: "unsafe", marks: [{ type: "link", attrs: { href: "http://unsafe.test" } }] },
    ] }] })).toThrow();
  });
  it("accepts only canonical protected image paths", () => {
    const doc = (src: string) => ({ type: "doc", content: [{ type: "image", attrs: { src, alt: "photo" } }] });
    expect(parseNoticeDocument(doc("/api/content-assets/11111111-1111-4111-8111-111111111111"))).toBeTruthy();
    expect(() => parseNoticeDocument(doc("/api/content-assets/../secret"))).toThrow();
    expect(parseNoticeDocument(doc("/api/public/notice-media/11111111-1111-4111-8111-111111111111"))).toBeTruthy();
    expect(() => parseNoticeDocument(doc("/api/public/notice-media/../secret"))).toThrow();
  });
  it("accepts the supported Tiptap document set", () => {
    expect(parseNoticeDocument({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "안내" }] },
        { type: "paragraph", content: [{ type: "text", text: "본문", marks: [{ type: "bold" }] }] },
        { type: "image", attrs: { src: "https://example.com/notice.webp", alt: "공지 대표 이미지" } },
      ],
    }).type).toBe("doc");
  });
  it("accepts only canonical validated official video nodes", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const video = (overrides: Record<string, unknown> = {}) => ({
      type: "doc", content: [{ type: "video", attrs: {
        src: `/api/public/notice-media/${id}`,
        poster: `/api/public/notice-media/${id}?variant=thumbnail`,
        alt: "공식 영상", width: 1920, height: 1080, durationSeconds: 42,
        ...overrides,
      } }],
    });
    expect(parseNoticeDocument(video())).toBeTruthy();
    expect(() => parseNoticeDocument(video({ src: "https://example.com/video.mp4" }))).toThrow();
    expect(() => parseNoticeDocument(video({ poster: `/api/public/notice-media/22222222-2222-4222-8222-222222222222?variant=thumbnail` }))).toThrow();
    expect(() => parseNoticeDocument(video({ durationSeconds: 61 }))).toThrow();
  });

  it("validates registered external videos and ended sources without a target", () => {
    const video = (overrides: Record<string, unknown> = {}) => ({ type: "doc", content: [{ type: "externalVideo", attrs: {
      src: "https://www.youtube.com/watch?v=registered", alt: "공식 영상", width: 1920, height: 1080, sourceLabel: "YouTube", ...overrides,
    } }] });
    expect(parseNoticeDocument(video())).toBeTruthy();
    expect(parseNoticeDocument(video({ state: "unavailable", src: null }))).toBeTruthy();
    for (const src of ["http://example.com/video", "javascript:alert(1)", "https://user:pass@example.com/video", "/relative-video"]) {
      expect(() => parseNoticeDocument(video({ src }))).toThrow();
    }
    expect(() => parseNoticeDocument(video({ state: "unavailable" }))).toThrow();
    expect(() => parseNoticeDocument(video({ poster: "javascript:alert(1)" }))).toThrow();
    expect(() => parseNoticeDocument(video({ width: 0 }))).toThrow();
  });

  it.each([
    { type: "doc", content: [{ type: "paragraph" }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] },
    { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
    { type: "doc", content: [{ type: "codeBlock" }] },
    { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/a.png", alt: "" } }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href: "http://example.com" } }] }] }] },
  ])("rejects unsupported or unsafe rich text %#", (document) => {
    expect(() => parseNoticeDocument(document)).toThrow();
  });
});
