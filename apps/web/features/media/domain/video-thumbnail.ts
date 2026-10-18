import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";

// Verified public covers remain available when TikTok blocks its oEmbed endpoint.
const curatedCovers: Record<string, string> = {
  "https://www.tiktok.com/@ifewknow/video/7690854938997558549": "/images/media/tiktok/7690854938997558549.jpg",
  "https://www.tiktok.com/@ifewknow/video/7689367463607192852": "/images/media/tiktok/7689367463607192852.jpg",
};

export function videoThumbnailUrl(href: string): string | null {
  const id = youtubeVideoId(href);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : curatedCovers[href] ?? null;
}

export function youtubeVideoId(href: string): string | null {
  if (!isRecordedReplayUrl("youtube", href)) return null;
  const url = new URL(href);
  return url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.split("/").at(-1)!;
}
