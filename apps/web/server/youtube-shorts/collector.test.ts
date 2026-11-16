import { describe, expect, it } from "vitest";
import { collectYouTubeShorts, eligible, type Video } from "./collector";
const video: Video = { id: "abcdefghijk", snippet: { channelId: "UCabcdefghijklmnopqrstuv", title: " 원문 제목 그대로 ", publishedAt: "2026-11-15T00:00:00Z", liveBroadcastContent: "none" }, status: { privacyStatus: "public", embeddable: true }, contentDetails: { duration: "PT3M" } };
describe("Shorts collection", () => {
  it("accepts 3 minutes and rejects long, live, private and foreign videos", () => {
    expect(eligible(video, video.snippet.channelId)).toBe(true);
    expect(eligible({ ...video, contentDetails: { duration: "PT3M1S" } }, video.snippet.channelId)).toBe(false);
    expect(eligible({ ...video, liveStreamingDetails: {} }, video.snippet.channelId)).toBe(false);
    expect(eligible({ ...video, status: { privacyStatus: "private", embeddable: true } }, video.snippet.channelId)).toBe(false);
    expect(eligible(video, "other")).toBe(false);
  });
  it("stores the original title and hides a missing stale video", async () => {
    const saved: string[] = [], hidden: boolean[] = [];
    const payloads = [{ items: [{ id: video.snippet.channelId }] }, { items: [{ contentDetails: { videoId: video.id } }] }, { items: [video] }, { items: [] }];
    const result = await collectYouTubeShorts({ sources: async () => [{ celebrity_id: "a", url: `https://www.youtube.com/channel/${video.snippet.channelId}` }], stale: async () => [{ video_id: "missing0000x", celebrity_id: "a" }], save: async (_id, _url, item) => { saved.push(item.snippet.title); }, check: async (_id, unavailable) => { hidden.push(unavailable); } }, "key", async () => Response.json(payloads.shift()));
    expect(result).toEqual({ saved: 1, checked: 1, failed: 0 });
    expect(saved).toEqual([video.snippet.title]); expect(hidden).toEqual([true]);
  });
  it("does not hide videos when the upstream fails", async () => {
    let writes = 0;
    const result = await collectYouTubeShorts({ sources: async () => [{ celebrity_id: "a", url: "https://www.youtube.com/@changha" }], stale: async () => [{ video_id: video.id, celebrity_id: "a" }], save: async () => { writes++; }, check: async () => { writes++; } }, "key", async () => new Response("", { status: 503 }));
    expect(result.failed).toBe(2); expect(writes).toBe(0);
  });
});
