"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import { Play } from "lucide-react";
import { useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { editorText } from "./editor-copy";
import styles from "./rich-text.module.css";

/** The YouTube player loads only after a press, so reading a post sends nothing to YouTube but the poster request. */
export function RichYouTubeEmbed({ videoId, locale, interactive = true }: { videoId: string; locale: AppLocale; interactive?: boolean }) {
  const [playing, setPlaying] = useState(false);
  return <div className={styles.youtube} data-rich-youtube={videoId}>
    {playing
      ? <iframe src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`} title={editorText(locale, "youtubeTitle")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
      : <><img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" referrerPolicy="no-referrer" />
        {interactive
          ? <BaseButton aria-label={editorText(locale, "playYoutube")} onClick={() => setPlaying(true)}><Play aria-hidden="true" /></BaseButton>
          : <span aria-hidden="true"><Play /></span>}</>}
  </div>;
}
