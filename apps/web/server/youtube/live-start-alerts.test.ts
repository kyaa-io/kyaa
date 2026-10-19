import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ObservedLiveCard, ObservedLiveFeed } from "../../features/live/domain/observed-live";
import type { PublishedCelebrity } from "../content/content-domain";
import { createGetObservedLiveNow } from "../../app/api/public/live-now/route";
import { captureYouTubeLiveStarts } from "./live-start-alerts";

const now = new Date("2026-10-20T03:00:00Z");
const videoId = "abcDEF123_-";
const channelId = `UC${"a".repeat(22)}`;
const card: ObservedLiveCard = {
  platform: "youtube", celebritySlug: "test-creator", creatorName: "최애", handle: `id:${channelId}`,
  title: "원문 방송 제목", thumbnailUrl: "/creator.jpg",
  watchUrl: `https://www.youtube.com/watch?v=${videoId}`, observedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 300_000).toISOString(),
};
const feed = (items: ObservedLiveCard[]): ObservedLiveFeed => ({
  items, checkedAt: now.toISOString(), coverage: { live: items.length, offline: 0, unavailable: 0, stale: 0 },
});

afterEach(() => vi.restoreAllMocks());

describe("YouTube live start capture", () => {
  it("passes only broadcast identity and observation time to the existing queue", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await captureYouTubeLiveStarts(feed([card]), { rpc }, now);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("capture_telegram_youtube_live_starts", {
      p_observations: [{ celebrity_slug: "test-creator", video_id: videoId, observed_at: now.toISOString() }],
    });
  });

  it("ignores offline/missing, stale, future, malformed, and other-provider observations", async () => {
    const rpc = vi.fn();
    await captureYouTubeLiveStarts(feed([]), { rpc }, now);
    await captureYouTubeLiveStarts(feed([
      { ...card, observedAt: new Date(now.getTime() - 300_000).toISOString() },
      { ...card, observedAt: new Date(now.getTime() + 1).toISOString() },
      { ...card, observedAt: "invalid" },
      { ...card, watchUrl: `${card.watchUrl}&extra=1` },
      { ...card, watchUrl: "https://evil.test/watch?v=abcDEF123_-" },
      { ...card, platform: "tiktok" },
    ]), { rpc }, now);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("exposes queue failure for the route to report without leaking database errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "private database details" } });
    await expect(captureYouTubeLiveStarts(feed([card]), { rpc }, now)).rejects.toThrow("YOUTUBE_LIVE_ALERT_CAPTURE_FAILED");
  });

  it("captures a confirmed feed through the public route, including repeated observations", async () => {
    const creator: PublishedCelebrity = {
      slug: "test-creator", locale: "ko", name: "최애", summary: "소개",
      image: { url: "/creator.jpg", alt: "최애", position: "center" },
      roles: ["creator"], themes: [], socialLinks: [{ platform: "youtube", url: `https://www.youtube.com/channel/${channelId}` }],
      displayOrder: 0, fanCount: 0,
    };
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const observeYouTube = vi.fn().mockResolvedValue({ state: "live", observedAt: now.toISOString(), channelId, videoId });
    const handler = createGetObservedLiveNow({
      repository: { list: async () => [creator] }, observeYouTube, now: () => now,
      captureLiveStarts: (value) => captureYouTubeLiveStarts(value, { rpc }, now),
    });
    for (let i = 0; i < 2; i++) {
      expect((await handler(new Request("https://kyaa.io/api/public/live-now?v=2"))).status).toBe(200);
    }
    // The durable database key, rather than process memory, owns deduplication.
    expect(rpc).toHaveBeenCalledTimes(2);
    observeYouTube.mockResolvedValue({ state: "unavailable", observedAt: now.toISOString() });
    expect((await handler(new Request("https://kyaa.io/api/public/live-now?v=2"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);

    observeYouTube.mockResolvedValue({ state: "live", observedAt: now.toISOString(), channelId, videoId });
    rpc.mockRejectedValue(new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handler(new Request("https://kyaa.io/api/public/live-now?v=2"));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("YOUTUBE_LIVE_ALERT_CAPTURE_FAILED");
  });
});
