"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HomeShort } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { CreatorGroupLink, navigation, shortCover } from "./home-shorts";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { ShortsPlayer } from "./shorts-player";
import { ShortsEngagement } from "./shorts-engagement";
import styles from "./home-shorts.module.css";

type CaptionNode = { type: string; text?: string; content?: CaptionNode[] };

function ExpandedCaption({ item, locale }: { item: HomeShort; locale: AppLocale }) {
  const [text, setText] = useState(item.title);
  useEffect(() => {
    if (!item.sourceNoticeSlug) return;
    const request = new AbortController();
    async function load() {
      const url = `/api/public/celebrities/${encodeURIComponent(item.creator.slug)}/notices/${item.sourceNoticeSlug}?locale=ko`;
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) return;
      const { notice } = await response.json();
      const paragraphs: CaptionNode[] = notice?.body?.content ?? [];
      const caption = paragraphs.filter(node => node.type === "paragraph").map(node =>
        node.content?.map(chunk => chunk.type === "hardBreak" ? "\n" : chunk.text ?? "").join("") ?? ""
      ).filter(line => line !== item.href).join("\n");
      if (caption && !request.signal.aborted) setText(caption);
    }
    void load().catch(() => undefined);
    return () => request.abort();
  }, [item]);
  return <div className={styles.expandedCaption}><TranslatedText text={text} locale={locale} /></div>;
}

export function ShortsFeed({ items, locale, initialVideo, onClose }: {
  items: readonly HomeShort[]; locale: AppLocale; initialVideo?: string; onClose(): void;
}) {
  const like = useRef<() => void>(null);
  const feed = useRef<HTMLDivElement>(null);
  const initial = useRef(Math.max(0, items.findIndex(item => item.videoId === initialVideo)));
  const [active, setActive] = useState(initial.current);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const node = feed.current;
    if (node) { node.scrollTop = initial.current * node.clientHeight; node.focus(); }
  }, []);
  function move(delta: number) {
    const node = feed.current;
    if (node) node.scrollTop = (active + delta) * node.clientHeight;
  }
  return <div className={styles.feedShell}>
    <div className={styles.feed} ref={feed} tabIndex={0} onScroll={event => {
      const node = event.currentTarget;
      const next = Math.round(node.scrollTop / node.clientHeight);
      if (next === active || !items[next]) return;
      setActive(next); setExpanded(false);
      const url = new URL(location.href);
      url.searchParams.set("video", items[next].videoId);
      history.replaceState(history.state, "", url);
    }} onKeyDown={event => {
      if (event.target instanceof Element && event.target.closest("input,textarea,[role=dialog]")) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1);
      }
    }}>
      {items.map((item, index) => <article data-outbound-placement="shorts-player" key={item.id} className={styles.slide}>
        {index === active && item.platform !== "instagram" ? <ShortsPlayer item={item} locale={locale} onLike={() => like.current?.()} immersive /> :
          Math.abs(index - active) <= 1 && (item.thumbnail || shortCover(item)) && <img src={item.thumbnail ?? shortCover(item) ?? undefined} alt="" />}
        {index === active && <>
          <div className={styles.feedCaption}><CreatorGroupLink item={item} locale={locale} className={styles.viewerCreatorLink} />
            <FanAction variant="text" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? fanUiText(locale, "close") : item.title}</FanAction>
            {expanded && <ExpandedCaption item={item} locale={locale} />}
            <a href={item.href} target="_blank" rel="noopener noreferrer" data-outbound-kind="external">{item.platform === "instagram" ? "Instagram" : item.platform === "tiktok" ? "TikTok" : "YouTube"} ↗</a>
          </div>
          <div className={styles.feedRail}><ShortsEngagement likeRef={like} videoId={item.videoId} locale={locale} offset={0} /></div>
        </>}
      </article>)}
    </div>
    <FanAction variant="text" type="button" className={styles.feedClose} onClick={onClose} ariaLabel={fanUiText(locale, "close")}>×</FanAction>
    <div className={styles.feedNav}>{[-1, 1].map((delta, i) => <FanAction variant="text" type="button" key={delta} ariaLabel={navigation[locale][i]} disabled={!items[active + delta]} onClick={() => move(delta)}>{delta < 0 ? "↑" : "↓"}</FanAction>)}</div>
  </div>;
}
