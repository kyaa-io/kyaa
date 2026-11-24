"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImageOff, Play } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { videoThumbnailUrl, youtubeVideoId } from "../domain/video-thumbnail";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";
import { MediaBackdrop } from "@/components/fan-ui/media-fill";
import styles from "./creator-media-panel.module.css";

const LETTERBOXED_YOUTUBE_COVER = /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/(?:hq|sd|)default\.(?:jpg|webp)$|^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/[0-3]\.(?:jpg|webp)$/;

export function MediaThumbnail({ image, href, kind, source, locale, priority = false, iconOnly = false, backdrop = false, title, onMissing }: { title?: string; /** Called once no cover can be shown. A caller that would rather leave the card out than show a bare frame removes it here. */ onMissing?: () => void; image: string | null; href: string; kind: "photos" | "videos" | "replays"; source?: string; locale: AppLocale; priority?: boolean; iconOnly?: boolean; /** The frame carries `mediaFillClass`; the cover's own blurred copy fills what the whole picture leaves. */ backdrop?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const id = kind !== "photos" ? youtubeVideoId(href) : null;
  // Stored video covers have a full-size companion behind the same public authorization check.
  const original = kind !== "photos"
    ? image?.match(/^(\/api\/public\/notice-media\/[0-9a-f-]{36})\?variant=thumbnail$/)?.[1]
    : undefined;
  const stored = original ?? image;
  const youtubeCover = id ? `https://i.ytimg.com/vi/${id}` : null;
  const preferredStored = stored && !stored.startsWith("https://i.ytimg.com/") ? stored : null;
  // sddefault and hqdefault can contain baked-in bars. Use the wide variants in compact tiles.
  const candidates = youtubeCover
    ? [
      preferredStored,
      `${youtubeCover}/maxresdefault.jpg`,
      `${youtubeCover}/hq720.jpg`,
      `${youtubeCover}/mqdefault.jpg`,
      image && !LETTERBOXED_YOUTUBE_COVER.test(image) ? image : null,
    ]
    : kind === "photos" ? [image] : [original, image, videoThumbnailUrl(href)];
  const src = candidates.find((value): value is string => typeof value === "string" && value.length > 0 && !failed.includes(value));
  const provider = id ? "YouTube" : isRecordedReplayUrl("instagram", href) ? "Instagram" : isRecordedReplayUrl("tiktok", href) ? "TikTok" : source;
  useEffect(() => { if (!src) onMissing?.(); }, [src, onMissing]);
  if (!src) return <span className={styles.thumbnailFallback} data-video-fallback={kind !== "photos" || undefined} aria-hidden="true">{kind === "photos" ? <ImageOff size={28} /> : provider && ["YouTube", "Instagram", "TikTok"].includes(provider) ? <Image src={`/images/guest-home/${provider.toLowerCase()}.svg`} width={28} height={28} alt="" unoptimized /> : <Play size={28} />}{(!iconOnly || kind !== "photos") && <span>{[provider, title && !/^https?:\/\//i.test(title.trim()) ? title : participationCopy(locale)[kind]].filter(Boolean).join(" · ")}</span>}</span>;
  // API images must recheck visibility instead of being retained in the image optimizer cache.
  const local = src.startsWith("/") && !src.startsWith("//") && !src.startsWith("/api/");
  const picture = <Image src={src} width={640} height={360} alt="" unoptimized={!local} sizes={local ? "(max-width: 767px) 50vw, 320px" : undefined} referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
    data-media-portrait={dimensions && dimensions.height > dimensions.width || undefined}
    style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
    // YouTube answers a missing size with a 120×90 grey placeholder; treat it as a failure and try the next cover.
    onLoad={event => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      // Prefer a provider cover when the stored image cannot fill a 188px tile at 2×.
      const undersizedStoredCover = id && src === preferredStored && naturalWidth < 376;
      if (id && (naturalWidth <= 120 || undersizedStoredCover)) {
        setFailed(previous => [...previous, src]);
        return;
      }
      if (kind !== "photos" && !id && naturalWidth > 0) setDimensions({ width: naturalWidth, height: naturalHeight });
    }}
    onError={() => { setDimensions(undefined); setFailed(previous => [...previous, src]); }} />;
  return backdrop ? <><MediaBackdrop src={src} />{picture}</> : picture;
}
