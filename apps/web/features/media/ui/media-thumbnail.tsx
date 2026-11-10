"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff, Play } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { videoThumbnailUrl, youtubeVideoId } from "../domain/video-thumbnail";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";
import styles from "./creator-media-panel.module.css";

const LETTERBOXED_YOUTUBE_COVER = /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/(?:hq|sd|)default\.(?:jpg|webp)$|^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/[0-3]\.(?:jpg|webp)$/;

export function MediaThumbnail({ image, href, kind, source, locale, iconOnly = false }: { image: string | null; href: string; kind: "photos" | "videos" | "replays"; source?: string; locale: AppLocale; iconOnly?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const id = kind !== "photos" ? youtubeVideoId(href) : null;
  // Thumbnail-only tiles never show black bands: YouTube's 4:3 covers (hqdefault and friends) carry baked-in bars,
  // so those tiles use the 16:9 covers and show the whole frame over a blurred copy of itself (R5).
  const blurFill = iconOnly && Boolean(id);
  const candidates = blurFill
    ? [image && !LETTERBOXED_YOUTUBE_COVER.test(image) ? image : null, `https://i.ytimg.com/vi/${id}/hq720.jpg`, `https://i.ytimg.com/vi/${id}/mqdefault.jpg`]
    : [image, videoThumbnailUrl(href), ...(id ? [`https://i.ytimg.com/vi/${id}/mqdefault.jpg`] : [])];
  const src = candidates.find((value): value is string => typeof value === "string" && value.length > 0 && !failed.includes(value));
  const provider = id ? "YouTube" : isRecordedReplayUrl("instagram", href) ? "Instagram" : isRecordedReplayUrl("tiktok", href) ? "TikTok" : source;
  if (!src) return <span className={styles.thumbnailFallback} aria-hidden="true">{kind === "photos" ? <ImageOff size={28} /> : <Play size={28} />}{!iconOnly && <span>{[provider, participationCopy(locale)[kind]].filter(Boolean).join(" · ")}</span>}</span>;
  // YouTube answers a missing size with a 120×90 grey placeholder; treat it as a failure and try the next cover.
  if (blurFill) return <span className={styles.blurFill} data-media-fill="blur">
    <img src={src} alt="" aria-hidden="true" referrerPolicy="no-referrer" className={styles.blurBack} />
    <Image src={src} width={640} height={360} alt="" unoptimized referrerPolicy="no-referrer" className={styles.blurFront}
      onLoad={event => { if (event.currentTarget.naturalWidth <= 120) setFailed(previous => [...previous, src]); }}
      onError={() => setFailed(previous => [...previous, src])} />
  </span>;
  return <Image src={src} width={640} height={360} alt="" unoptimized referrerPolicy="no-referrer"
    data-media-portrait={dimensions && dimensions.height > dimensions.width || undefined}
    style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
    onLoad={event => { const img = event.currentTarget; if (kind !== "photos" && !id && img.naturalWidth > 0) setDimensions({ width: img.naturalWidth, height: img.naturalHeight }); }}
    onError={() => { setDimensions(undefined); setFailed(previous => [...previous, src]); }} />;
}
