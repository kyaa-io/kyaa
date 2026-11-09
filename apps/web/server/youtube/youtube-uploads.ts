import { isAwsHosting } from "../config/hosting";
import "server-only";
import { z } from "zod";
import { parseYouTubeChannelUrl } from "@/features/live/domain/youtube-channel";
import type { OfficialMedia } from "@/features/media/domain/official-media";
import { fetchYouTubeApiJson } from "./youtube-live-source";

const channelId = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);
const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const channelPage = z.object({ items: z.array(z.object({ id: channelId, contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().regex(/^UU[A-Za-z0-9_-]{22}$/) }) }) })).max(1) });
const playlistPage = z.object({ items: z.array(z.object({ contentDetails: z.object({ videoId }) })).max(6) });
const videoPage = z.object({ items: z.array(z.object({ id: videoId, snippet: z.object({ channelId, title: z.string().max(500), publishedAt: z.iso.datetime({ offset: true }), liveBroadcastContent: z.enum(["none", "live", "upcoming"]) }), status: z.object({ privacyStatus: z.enum(["public", "private", "unlisted"]) }), liveStreamingDetails: z.record(z.string(), z.unknown()).optional() })).max(6) });

/** Only the published official channel is resolved; this never searches for matching names. */
export async function readYouTubeUploads(channelUrl: string, options: { apiKey?: string; fetcher?: typeof fetch } = {}): Promise<OfficialMedia[] | null> {
  const target = parseYouTubeChannelUrl(channelUrl);
  if (!target) return [];
  const apiKey = options.apiKey ?? process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return null;
  // Native Next data cache bounds upstream API calls without another cache service.
  const fetcher: typeof fetch = options.fetcher ?? ((input, init) => fetch(input, isAwsHosting() ? { ...init, cache: "no-store" } : { ...init, cache: "force-cache", next: { revalidate: 900 } }));
  async function get(path: string, params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.search = new URLSearchParams({ ...params, key: apiKey! }).toString();
    return (await fetchYouTubeApiJson(url, fetcher, Date.now()))?.payload;
  }
  try {
    const channels = channelPage.parse(await get("channels", { part: "contentDetails", [target.kind === "id" ? "id" : "forHandle"]: target.value }));
    const channel = channels.items[0];
    if (!channel) return [];
    if (target.kind === "id" && channel.id !== target.value) return null;
    const playlist = playlistPage.parse(await get("playlistItems", { part: "contentDetails", playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: "6" }));
    if (!playlist.items.length) return [];
    const requested = new Set(playlist.items.map(item => item.contentDetails.videoId));
    const videos = videoPage.parse(await get("videos", { part: "snippet,status,liveStreamingDetails", id: [...requested].join(",") }));
    return videos.items.filter(item => requested.has(item.id) && item.snippet.channelId === channel.id && item.status.privacyStatus === "public" && item.snippet.liveBroadcastContent === "none" && !item.liveStreamingDetails)
      .map(item => ({ id: `youtube:${item.id}`, kind: "videos" as const, title: item.snippet.title, image: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`, asset: null, href: `https://www.youtube.com/watch?v=${item.id}`, date: item.snippet.publishedAt }))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  } catch { return null; }
}

const embedVideoPage = z.object({ items: z.array(z.object({ id: videoId, snippet: z.object({ channelId, publishedAt: z.iso.datetime({ offset: true }), liveBroadcastContent: z.enum(["none", "live", "upcoming"]) }), status: z.object({ privacyStatus: z.enum(["public", "private", "unlisted"]), embeddable: z.boolean() }), contentDetails: z.object({ duration: z.string().max(40) }) })).max(50) });
// playlistItems and videos.list both take 50 ids per call, so a wider window costs no extra quota.
const EMBED_CANDIDATES = 50;
export const EMBED_MIN_SECONDS = 60;
const EMBED_FRESH_MS = 15 * 60_000;

/** ISO 8601 duration from videos.list (`PT1M30S`, `PT1H`, `P0D`); anything unparseable counts as 0. */
export function youtubeDurationSeconds(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return 0;
  const [, d, h, m, sec] = match.map(part => Number(part ?? 0));
  return d * 86_400 + h * 3_600 + m * 60 + sec;
}

/**
 * The newest upload that can actually play inside an embed: public, embeddable, recorded, at least 60 seconds.
 * `videoId: null` means the channel has no such video; `null` means the API could not answer.
 * Candidates are checked with one videos.list call, so quota stays at three units per lookup.
 */
export async function pickEmbeddableUpload(channelUrl: string, options: { apiKey?: string; fetcher?: typeof fetch } = {}): Promise<{ videoId: string | null } | null> {
  const target = parseYouTubeChannelUrl(channelUrl);
  if (!target) return { videoId: null };
  const apiKey = options.apiKey ?? process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return null;
  const fetcher: typeof fetch = options.fetcher ?? ((input, init) => fetch(input, isAwsHosting() ? { ...init, cache: "no-store" } : { ...init, cache: "force-cache", next: { revalidate: 900 } }));
  async function get(path: string, params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.search = new URLSearchParams({ ...params, key: apiKey! }).toString();
    return (await fetchYouTubeApiJson(url, fetcher, Date.now()))?.payload;
  }
  try {
    const channel = channelPage.parse(await get("channels", { part: "contentDetails", [target.kind === "id" ? "id" : "forHandle"]: target.value })).items[0];
    if (!channel) return { videoId: null };
    if (target.kind === "id" && channel.id !== target.value) return null;
    const playlist = z.object({ items: z.array(z.object({ contentDetails: z.object({ videoId }) })).max(EMBED_CANDIDATES) })
      .parse(await get("playlistItems", { part: "contentDetails", playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: String(EMBED_CANDIDATES) }));
    const requested = new Set(playlist.items.map(item => item.contentDetails.videoId));
    if (!requested.size) return { videoId: null };
    const videos = embedVideoPage.parse(await get("videos", { part: "snippet,status,contentDetails", id: [...requested].join(",") }));
    const best = videos.items
      .filter(item => requested.has(item.id) && item.snippet.channelId === channel.id && item.status.privacyStatus === "public" && item.status.embeddable
        && item.snippet.liveBroadcastContent === "none" && youtubeDurationSeconds(item.contentDetails.duration) >= EMBED_MIN_SECONDS)
      .sort((a, b) => Date.parse(b.snippet.publishedAt) - Date.parse(a.snippet.publishedAt))[0];
    return { videoId: best?.id ?? null };
  } catch { return null; }
}

const lastKnownEmbed = new Map<string, { videoId: string | null; at: number }>();

/** Picks the embed video for a channel. A failed or over-quota API answer falls back to the last good answer, then to no player. */
export async function readOfficialEmbedVideoId(channelUrl: string, options: { apiKey?: string; fetcher?: typeof fetch; now?: () => number } = {}): Promise<string | null> {
  const now = options.now ?? Date.now;
  const known = lastKnownEmbed.get(channelUrl);
  if (known && now() - known.at < EMBED_FRESH_MS) return known.videoId;
  const picked = await pickEmbeddableUpload(channelUrl, options);
  if (!picked) return known?.videoId ?? null;
  lastKnownEmbed.set(channelUrl, { videoId: picked.videoId, at: now() });
  return picked.videoId;
}

/** Test seam: the fallback memory is per server process. */
export const resetOfficialEmbedCache = () => lastKnownEmbed.clear();
