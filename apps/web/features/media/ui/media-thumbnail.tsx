"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff, Play } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { videoThumbnailUrl, youtubeVideoId } from "../domain/video-thumbnail";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";
import styles from "./creator-media-panel.module.css";

export function MediaThumbnail({ image, href, kind, source, locale }: { image: string | null; href: string; kind: "photos" | "videos" | "replays"; source?: string; locale: AppLocale }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const id = kind !== "photos" ? youtubeVideoId(href) : null;
  const src = [image, videoThumbnailUrl(href), ...(id ? [`https://i.ytimg.com/vi/${id}/mqdefault.jpg`] : [])].find((value): value is string => typeof value === "string" && value.length > 0 && !failed.includes(value));
  const provider = id ? "YouTube" : isRecordedReplayUrl("instagram", href) ? "Instagram" : isRecordedReplayUrl("tiktok", href) ? "TikTok" : source;
  if (!src) return <span className={styles.thumbnailFallback} aria-hidden="true">{kind === "photos" ? <ImageOff size={28} /> : <Play size={28} />}<span>{[provider, participationCopy(locale)[kind]].filter(Boolean).join(" · ")}</span></span>;
  return <Image src={src} width={640} height={360} alt="" unoptimized referrerPolicy="no-referrer"
    data-media-portrait={dimensions && dimensions.height > dimensions.width || undefined}
    style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
    onLoad={event => { const img = event.currentTarget; if (kind !== "photos" && !id && img.naturalWidth > 0) setDimensions({ width: img.naturalWidth, height: img.naturalHeight }); }}
    onError={() => { setDimensions(undefined); setFailed(previous => [...previous, src]); }} />;
}
