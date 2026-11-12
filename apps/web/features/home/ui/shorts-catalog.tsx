"use client";

import { useMemo, useState } from "react";
import { FanSelectMenu } from "@/components/fan-ui/fan-select-menu";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import type { HomeShort } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import { HomeShorts } from "./home-shorts";
import styles from "./home-gallery-page.module.css";

const copy: Record<AppLocale, { sort: string; latest: string; popular: string; artists: string; all: string }> = {
  ko: { sort: "정렬", latest: "최신", popular: "인기", artists: "아티스트", all: "전체" },
  en: { sort: "Sort", latest: "Latest", popular: "Popular", artists: "Artists", all: "All" },
  ja: { sort: "並び順", latest: "新着", popular: "人気", artists: "アーティスト", all: "すべて" },
  "zh-Hans": { sort: "排序", latest: "最新", popular: "热门", artists: "艺人", all: "全部" },
  "zh-Hant": { sort: "排序", latest: "最新", popular: "熱門", artists: "藝人", all: "全部" },
  es: { sort: "Ordenar", latest: "Recientes", popular: "Populares", artists: "Artistas", all: "Todos" },
  id: { sort: "Urutkan", latest: "Terbaru", popular: "Populer", artists: "Artis", all: "Semua" },
  vi: { sort: "Sắp xếp", latest: "Mới nhất", popular: "Phổ biến", artists: "Nghệ sĩ", all: "Tất cả" },
  th: { sort: "เรียงลำดับ", latest: "ล่าสุด", popular: "ยอดนิยม", artists: "ศิลปิน", all: "ทั้งหมด" },
  pt: { sort: "Ordenar", latest: "Recentes", popular: "Populares", artists: "Artistas", all: "Todos" },
  fr: { sort: "Trier", latest: "Récents", popular: "Populaires", artists: "Artistes", all: "Tous" },
  ru: { sort: "Порядок", latest: "Новые", popular: "Популярные", artists: "Артисты", all: "Все" },
};

export function ShortsCatalog({ catalog, locale, initialVideo }: { catalog: { items: readonly HomeShort[]; likes: Record<string, number> }; locale: AppLocale; initialVideo?: string }) {
  const [sort, setSort] = useState("latest");
  const [artist, setArtist] = useState("all");
  const t = copy[locale];
  const artists = useMemo(() => [...new Map(catalog.items.map(item => [item.creator.slug, item.creator.name])).entries()], [catalog.items]);
  const items = useMemo(() => {
    const selected = catalog.items.filter(item => artist === "all" || item.creator.slug === artist);
    return sort === "popular" ? [...selected].sort((a, b) => (catalog.likes[b.videoId] ?? 0) - (catalog.likes[a.videoId] ?? 0) || catalog.items.indexOf(a) - catalog.items.indexOf(b)) : selected;
  }, [artist, catalog, sort]);
  return <>
    <div className={styles.shortsControls}>
      <FanSelectMenu label={t.sort} value={sort} onValueChange={setSort} options={[{ value: "latest", label: t.latest }, { value: "popular", label: t.popular }]} />
      <FanTabs variant="chip" label={t.artists} current={artist} items={[{ key: "all", label: t.all, onSelect: () => setArtist("all") }, ...artists.map(([slug, name]) => ({ key: slug, label: name, onSelect: () => setArtist(slug) }))]} />
    </div>
    <HomeShorts key={`${sort}:${artist}`} items={items} locale={locale} layout="grid" initialVideo={initialVideo} />
  </>;
}
