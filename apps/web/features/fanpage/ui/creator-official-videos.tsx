"use client";

import { useEffect, useState } from "react";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { officialVideoChannel, officialVideoChannelUrl } from "@/features/fanpage/domain/official-video-channels";
import type { AppLocale } from "@/i18n/locales";
import styles from "./fanpage.module.css";

const titles: Record<AppLocale, string> = {
  ko: "공식 영상", en: "Official videos", ja: "公式動画",
  "zh-Hans": "官方视频", "zh-Hant": "官方影片", es: "Vídeos oficiales",
  id: "Video resmi", vi: "Video chính thức", th: "วิดีโออย่างเป็นทางการ",
  pt: "Vídeos oficiais", fr: "Vidéos officielles",
  ru: "Официальные видео",

};

/** The server picks a playable upload; without one only the YouTube link remains. */
function useEmbedVideoId(slug: string, pinned: string | undefined, enabled: boolean) {
  const [fetched, setFetched] = useState<{ slug: string; videoId: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || pinned) return;
    const controller = new AbortController();
    fetch(`/api/celebrities/${encodeURIComponent(slug)}/youtube/embed`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((body: { videoId?: unknown } | null) => setFetched({ slug, videoId: typeof body?.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(body.videoId) ? body.videoId : null }))
      .catch(() => { if (!controller.signal.aborted) setFetched({ slug, videoId: null }); });
    return () => controller.abort();
  }, [slug, pinned, enabled]);
  return pinned ?? (fetched?.slug === slug ? fetched.videoId : null);
}

export function CreatorOfficialVideos({ slug, locale }: { slug: string; locale: AppLocale }) {
  const channel = officialVideoChannel(slug);
  const videoId = useEmbedVideoId(slug, channel?.videoId, Boolean(channel));
  if (!channel) return null;
  return <section className={styles.officialVideos} aria-labelledby="official-videos-heading">
    <FanSectionHeader
      id="official-videos-heading"
      title={titles[locale]}
      action={{ label: "YouTube", href: officialVideoChannelUrl(channel.id) }}
    />
    {videoId ? <iframe
      className={styles.officialVideoFrame}
      title={`${channel.name} · ${titles[locale]}`}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=0&playsinline=1&hl=${locale}`}
      loading="lazy"
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    /> : null}
  </section>;
}
