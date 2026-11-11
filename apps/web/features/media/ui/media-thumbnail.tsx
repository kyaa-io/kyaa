"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff, Play } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { videoThumbnailUrl, youtubeVideoId } from "../domain/video-thumbnail";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";
import { MediaBackdrop } from "@/components/fan-ui/media-fill";
import styles from "./creator-media-panel.module.css";

const LETTERBOXED_YOUTUBE_COVER = /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/(?:hq|sd|)default\.(?:jpg|webp)$|^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/[0-3]\.(?:jpg|webp)$/;

export function MediaThumbnail({ image, href, kind, source, locale, priority = false, iconOnly = false, backdrop = false, title }: { title?: string; image: string | null; href: string; kind: "photos" | "videos" | "replays"; source?: string; locale: AppLocale; priority?: boolean; iconOnly?: boolean; /** The frame carries `mediaFillClass`; the cover's own blurred copy fills what the whole picture leaves. */ backdrop?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const id = kind !== "photos" ? youtubeVideoId(href) : null;
  // R5 (no black bands): YouTube's 4:3 covers (hqdefault and friends) carry baked-in bars, so text-free and backdrop tiles use the 16:9 covers.
  const barFree = Boolean(id) && (iconOnly || backdrop);
  const candidates = barFree
    ? [image && !LETTERBOXED_YOUTUBE_COVER.test(image) ? image : null, `https://i.ytimg.com/vi/${id}/hq720.jpg`, `https://i.ytimg.com/vi/${id}/mqdefault.jpg`]
    : [image, videoThumbnailUrl(href), ...(id ? [`https://i.ytimg.com/vi/${id}/mqdefault.jpg`] : [])];
  const src = candidates.find((value): value is string => typeof value === "string" && value.length > 0 && !failed.includes(value));
  const provider = id ? "YouTube" : isRecordedReplayUrl("instagram", href) ? "Instagram" : isRecordedReplayUrl("tiktok", href) ? "TikTok" : source;
  if (!src) return <span className={styles.thumbnailFallback} data-video-fallback={kind !== "photos" || undefined} aria-hidden="true">{kind === "photos" ? <ImageOff size={28} /> : provider && ["YouTube", "Instagram", "TikTok"].includes(provider) ? <Image src={`/images/guest-home/${provider.toLowerCase()}.svg`} width={28} height={28} alt="" unoptimized /> : <Play size={28} />}{(!iconOnly || kind !== "photos") && <span>{[provider, title || participationCopy(locale)[kind]].filter(Boolean).join(" · ")}</span>}</span>;
  // Own files (/images/…) go through the image optimizer at the tile width; other hosts stay as they are.
  const local = src.startsWith("/") && !src.startsWith("//");
  const picture = <Image src={src} width={640} height={360} alt="" unoptimized={!local} sizes={local ? "(max-width: 767px) 50vw, 320px" : undefined} referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
    data-media-portrait={dimensions && dimensions.height > dimensions.width || undefined}
    style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
    // YouTube answers a missing size with a 120×90 grey placeholder; treat it as a failure and try the next cover.
    onLoad={event => { const img = event.currentTarget; if (barFree && img.naturalWidth <= 120) { setFailed(previous => [...previous, src]); return; } if (kind !== "photos" && !id && img.naturalWidth > 0) setDimensions({ width: img.naturalWidth, height: img.naturalHeight }); }}
    onError={() => { setDimensions(undefined); setFailed(previous => [...previous, src]); }} />;
  return backdrop ? <><MediaBackdrop src={src} />{picture}</> : picture;
}
