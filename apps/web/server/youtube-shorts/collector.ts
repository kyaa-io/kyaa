import { parseYouTubeChannelUrl } from "@/features/live/domain/youtube-channel";
import { z } from "zod";

const videoSchema = z.object({
  id: z.string().regex(/^[\w-]{11}$/),
  snippet: z.object({ channelId: z.string(), title: z.string().min(1), publishedAt: z.iso.datetime({ offset: true }), liveBroadcastContent: z.string() }),
  status: z.object({ privacyStatus: z.string(), embeddable: z.boolean() }),
  contentDetails: z.object({ duration: z.string() }),
  liveStreamingDetails: z.unknown().optional(),
});
export type Video = z.infer<typeof videoSchema>;
export function eligible(video: Video, channel: string, maxSeconds = 180) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(video.contentDetails.duration);
  const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
  return video.snippet.channelId === channel && video.status.privacyStatus === "public" && video.status.embeddable
    && video.snippet.liveBroadcastContent === "none" && !video.liveStreamingDetails && seconds > 0 && seconds <= maxSeconds;
}
export type Db = {
  sources(): Promise<{ celebrity_id: string; url: string }[]>;
  stale(before: string): Promise<{ video_id: string; celebrity_id: string }[]>;
  save(id: string, url: string, video: Video, checkedAt: string): Promise<void>;
  check(videoId: string, unavailable: boolean, checkedAt: string): Promise<void>;
};
export async function collectYouTubeShorts(db: Db, key: string, fetcher: typeof fetch = fetch, now = () => new Date()) {
  async function get(path: string, params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.search = new URLSearchParams({ ...params, key }).toString();
    const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("YOUTUBE_API_FAILED");
    return response.json();
  }
  const checkedAt = now().toISOString();
  let saved = 0, failed = 0, checked = 0;
  const channels = new Map<string, string>();
  for (const source of await db.sources()) {
    try {
      const target = parseYouTubeChannelUrl(source.url);
      if (!target) continue;
      const payload = z.object({ items: z.array(z.object({ id: z.string().regex(/^UC[\w-]{22}$/) })).length(1) }).parse(await get("channels", { part: "id", [target.kind === "id" ? "id" : "forHandle"]: target.value }));
      const channel = payload.items[0].id;
      if (target.kind === "id" && channel !== target.value) throw new Error("CHANNEL_MISMATCH");
      channels.set(source.celebrity_id, channel);
      const playlist = z.object({ items: z.array(z.object({ contentDetails: z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }) })).max(10) }).parse(await get("playlistItems", { part: "contentDetails", playlistId: `UUSH${channel.slice(2)}`, maxResults: "10" }));
      const ids = playlist.items.map(item => item.contentDetails.videoId);
      if (!ids.length) continue;
      const videos = z.object({ items: z.array(videoSchema).max(10) }).parse(await get("videos", { part: "snippet,status,contentDetails,liveStreamingDetails", id: ids.join(",") }));
      for (const video of videos.items) if (ids.includes(video.id) && eligible(video, channel)) {
        await db.save(source.celebrity_id, source.url, video, checkedAt); saved++;
      }
    } catch { failed++; }
  }
  const stale = await db.stale(new Date(now().getTime() - 7 * 86400000).toISOString());
  for (let start = 0; start < stale.length; start += 50) {
    const batch = stale.slice(start, start + 50);
    try {
      const videos = z.object({ items: z.array(videoSchema).max(50) }).parse(await get("videos", { part: "snippet,status,contentDetails,liveStreamingDetails", id: batch.map(row => row.video_id).join(",") }));
      for (const row of batch) {
        const channel = channels.get(row.celebrity_id);
        if (!channel) continue; // Failed channel lookup must never hide existing content.
        const video = videos.items.find(item => item.id === row.video_id);
        await db.check(row.video_id, !video || !eligible(video, channel), checkedAt); checked++;
      }
    } catch { failed++; }
  }
  return { saved, checked, failed };
}
