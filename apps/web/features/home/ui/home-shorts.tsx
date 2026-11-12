"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanText } from "@/components/fan-ui/fan-text";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { mediaFillClass } from "@/components/fan-ui/media-fill";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MoreHorizontal, Play } from "@/components/fan-ui/fan-icons";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { MediaThumbnail } from "@/features/media/ui/media-thumbnail";
import { homeShortsPageSchema, type HomeShort } from "@/features/home/domain/home-gallery";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { FanScrollRow } from "@/components/fan-ui/fan-scroll-row";
import { ShortsEngagement } from "./shorts-engagement";
import { ShortsPlayer } from "./shorts-player";
import styles from "./home-shorts.module.css";

const navigation: Record<AppLocale, [string, string, string]> = {
  ko: ["이전 영상", "다음 영상", "더 보기"], en: ["Previous video", "Next video", "More"], ja: ["前の動画", "次の動画", "その他"],
  "zh-Hans": ["上一个视频", "下一个视频", "更多"], "zh-Hant": ["上一個影片", "下一個影片", "更多"],
  es: ["Vídeo anterior", "Siguiente vídeo", "Más"], id: ["Video sebelumnya", "Video berikutnya", "Lainnya"], vi: ["Video trước", "Video tiếp theo", "Thêm"], th: ["วิดีโอก่อนหน้า", "วิดีโอถัดไป", "เพิ่มเติม"], pt: ["Vídeo anterior", "Próximo vídeo", "Mais"], fr: ["Vidéo précédente", "Vidéo suivante", "Plus"], ru: ["Предыдущее видео", "Следующее видео", "Ещё"],
};

// TikTok covers are signed links that expire within a day, so the covers of the creators' TikTok notices are kept as site images.
const shortCover = (item: HomeShort) => item.platform === "tiktok" ? `/images/media/tiktok/${item.videoId}.jpg` : `https://i.ytimg.com/vi/${item.videoId}/oardefault.jpg`;

const PAGE_SIZE = 12;

export function HomeShorts({ items: firstItems, locale, layout = "rail", initialVideo, offset = 0, hasMore: firstHasMore = false }: { items: readonly HomeShort[]; locale: AppLocale; layout?: "rail" | "grid"; initialVideo?: string; offset?: number; hasMore?: boolean }) {
  // The grid loads the next page when its end scrolls into view and the rail when its right end comes near, so the rail always runs to the
  // container's edge; the viewer then steps through everything loaded. A short whose cover cannot be shown is left out (never a bare URL).
  const [loaded, setItems] = useState(firstItems);
  const [uncovered, setUncovered] = useState<ReadonlySet<string>>(new Set());
  const items = loaded.filter(item => !uncovered.has(item.id));
  const hideUncovered = useCallback((id: string) => setUncovered(current => current.has(id) ? current : new Set(current).add(id)), []);
  const [hasMore, setHasMore] = useState(firstHasMore);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const tail = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      const response = await fetch(`/api/public/home-shorts?locale=${toContentLocale(locale)}&offset=${offset + loaded.length}`);
      if (!response.ok) throw new Error();
      const page = homeShortsPageSchema.parse(await response.json());
      setItems(current => { const seen = new Set(current.map(item => item.id)); return [...current, ...page.items.filter(item => !seen.has(item.id))]; });
      setHasMore(page.hasMore && page.items.length > 0);
    } catch { setFailed(true); } finally { loading.current = false; }
  }, [loaded.length, locale, offset]);
  useEffect(() => {
    const node = tail.current;
    if (!node || layout !== "grid" || !hasMore || failed) return;
    const watch = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { rootMargin: "600px 0px" });
    watch.observe(node);
    return () => watch.disconnect();
  }, [layout, hasMore, failed, loadMore]);
  const [index, setIndex] = useState<number | null>(() => { const i = items.findIndex(item => item.videoId === initialVideo); return i < 0 ? null : i; });
  const [more, setMore] = useState(false);
  const startY = useRef<number | null>(null);
  const wheelAt = useRef(0);
  const selected = index === null ? null : items[index];
  const move = (delta: number) => { setIndex(i => i === null ? null : Math.max(0, Math.min(items.length - 1, i + delta))); setMore(false); };
  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.closest("input, textarea, select, [contenteditable=true]") || (event.target.closest("[data-overlay-content]") && !event.target.closest(`.${styles.viewer}`)))) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length]);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { startY.current = e.touches[0]?.clientY ?? null; },
    onTouchEnd: (e: React.TouchEvent) => { if (startY.current !== null) { const difference = startY.current - (e.changedTouches[0]?.clientY ?? startY.current); if (Math.abs(difference) >= 45) move(difference > 0 ? 1 : -1); } startY.current = null; },
  };
  const cards = items.map((item, i) => <li key={item.id} className={styles.item} data-row="short">
        <FanAction variant="text" type="button" className={styles.card} ariaLabel={item.title} onClick={() => setIndex(i)}>
          <span className={`${styles.cover} ${mediaFillClass}`}><MediaThumbnail image={item.thumbnail ?? shortCover(item)} href={item.href} kind="videos" locale={locale} backdrop onMissing={() => hideUncovered(item.id)} /><span className={styles.play} aria-hidden="true"><FanIcon icon={Play} filled /></span></span>
          <span className={styles.caption}>
            <CreatorAvatar slug={item.creator.slug} src={item.creator.avatar?.src ?? null} photos={item.creator.avatar?.photos} size={32} />
            <span className={styles.details}><span className={styles.title}>{item.title}</span><FanText role="meta" className={styles.meta}>{item.creator.name} · {item.platform === "tiktok" ? "TikTok" : "YouTube"}</FanText></span>
          </span>
        </FanAction>
      </li>);
  const nearEnd = useCallback(() => { if (hasMore && !failed) void loadMore(); }, [hasMore, failed, loadMore]);
  return <>
    {layout === "rail" ? <FanScrollRow className={styles.rail} locale={locale} onNearEnd={nearEnd}>{cards}</FanScrollRow> : <ul className={styles.grid}>{cards}</ul>}
    {layout === "rail" && hasMore && failed ? <FanAction variant="text" type="button" className={styles.retry} onClick={() => void loadMore()}>{participationCopy(locale).retry}</FanAction> : null}
    {layout === "grid" && hasMore && (failed ? <FanAction variant="text" type="button" className={styles.retry} onClick={() => void loadMore()}>{participationCopy(locale).retry}</FanAction> : <div ref={tail} className={styles.tail} aria-hidden="true" />)}
    <FanDialog className={styles.viewer} open={!!selected} onOpenChange={open => { if (!open) { setIndex(null); setMore(false); } }} title={selected?.title ?? ""} closeLabel={fanUiText(locale, "close")}>
      {selected && <div className={styles.player} data-outbound-placement="shorts-player" onWheel={e => { if (Math.abs(e.deltaY) > 20 && Date.now() - wheelAt.current > 600) { wheelAt.current = Date.now(); move(e.deltaY > 0 ? 1 : -1); } }}>
        <div className={styles.stage}>
          <div className={styles.swipeZone} {...swipe} aria-hidden="true" />
          <ShortsPlayer key={selected.videoId} item={selected} locale={locale} />
          <div className={styles.swipeZone} {...swipe} aria-hidden="true" />
        </div>
        <div className={styles.bottomBar} {...swipe}>
        <ShortsEngagement key={selected.videoId} videoId={selected.videoId} locale={locale} offset={offset + Math.floor((index ?? 0) / PAGE_SIZE) * PAGE_SIZE} />
        <div className={styles.controls}>
          <FanAction variant="text" type="button" onClick={() => move(-1)} disabled={index === 0} ariaLabel={navigation[locale][0]}><FanIcon icon={ChevronUp} /></FanAction>
          <FanAction variant="text" type="button" onClick={() => move(1)} disabled={index === items.length - 1} ariaLabel={navigation[locale][1]}><FanIcon icon={ChevronDown} /></FanAction>
          <span>{(index ?? 0) + 1} / {items.length}</span>
          <FanAction variant="text" type="button" ariaLabel={navigation[locale][2]} aria-expanded={more} onClick={() => setMore(value => !value)}><FanIcon icon={MoreHorizontal} /></FanAction>
          {more && <a href={selected.href} target="_blank" rel="noopener noreferrer" data-outbound-kind="external">{selected.platform === "tiktok" ? "TikTok" : "YouTube"} ↗</a>}
        </div>
        </div>
      </div>}
    </FanDialog>
  </>;
}
