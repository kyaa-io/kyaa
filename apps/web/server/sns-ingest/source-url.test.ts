import { describe, expect, it } from "vitest";
import { allowedImageUrl, parseAccountUrl, parsePostUrl, snsIngestSlug } from "./source-url";

describe("sns ingest source URLs", () => {
  it("reads the registered account handle", () => {
    expect(parseAccountUrl("instagram", "https://www.instagram.com/Wena.Official/")).toEqual({ handle: "wena.official" });
    expect(parseAccountUrl("tiktok", "https://www.tiktok.com/@wena")).toEqual({ handle: "wena" });
    expect(parseAccountUrl("instagram", "http://www.instagram.com/wena/")).toBeNull();
    expect(parseAccountUrl("instagram", "https://instagram.com.evil.example/wena/")).toBeNull();
  });

  it("requires a handle-bearing post URL without tracking parameters", () => {
    expect(parsePostUrl("instagram", "https://www.instagram.com/wena/p/DQabc123xyz/")).toEqual({ handle: "wena", sourceId: "DQabc123xyz" });
    expect(parsePostUrl("instagram", "https://www.instagram.com/wena/reel/DQabc123xyz/")).toEqual({ handle: "wena", sourceId: "DQabc123xyz" });
    expect(parsePostUrl("tiktok", "https://www.tiktok.com/@wena/video/7561234567890123456")).toEqual({ handle: "wena", sourceId: "7561234567890123456" });
    expect(parsePostUrl("instagram", "https://www.instagram.com/p/DQabc123xyz/")).toBeNull();
    expect(parsePostUrl("instagram", "https://www.instagram.com/wena/p/DQabc123xyz/?igsh=abc")).toBeNull();
    expect(parsePostUrl("tiktok", "https://www.instagram.com/@wena/video/7561234567890123456")).toBeNull();
  });

  it("keeps the collector's stable slug", () => {
    expect(snsIngestSlug("instagram", "DQabc123xyz")).toMatch(/^instagram-[0-9a-f]{16}$/);
    expect(snsIngestSlug("instagram", "DQabc123xyz")).toBe(snsIngestSlug("instagram", "DQabc123xyz"));
    expect(snsIngestSlug("tiktok", "1")).not.toBe(snsIngestSlug("tiktok", "2"));
  });

  it("downloads images only from platform CDNs", () => {
    expect(allowedImageUrl("https://scontent-icn2-1.cdninstagram.com/v/t51/a.jpg?stp=x")).not.toBeNull();
    expect(allowedImageUrl("https://scontent.xx.fbcdn.net/a.jpg")).not.toBeNull();
    expect(allowedImageUrl("https://p16-sign-sg.tiktokcdn.com/a.jpeg")).not.toBeNull();
    expect(allowedImageUrl("https://p16-sign.tiktokcdn-us.com/a.jpeg")).not.toBeNull();
    expect(allowedImageUrl("https://cdninstagram.com.evil.example/a.jpg")).toBeNull();
    expect(allowedImageUrl("http://scontent.cdninstagram.com/a.jpg")).toBeNull();
    expect(allowedImageUrl("https://169.254.169.254/latest")).toBeNull();
  });
});
