"use client";
import { useState } from "react";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { RollingNumber } from "@/components/fan-ui/rolling-number";
import type { AppLocale } from "@/i18n/locales";
import type { TodayFanpage } from "../domain/today-fanpage";
import { todayFanpageCopy } from "./today-fanpage-copy";
import numberStyles from "@/components/fan-ui/fan-number.module.css";
import styles from "./today-fanpage-banner.module.css";

/** 모임 맨 위 '오늘의 팬페이지'(대표 2026-11-14 02:07). 고르기는 `read_today_fanpages`, 여기는 그리기만 한다.
 * 카드 전체가 그 팬페이지로 가는 링크 하나. 활동 숫자는 0이 아닌 것만, 처음 한 번 0에서 실제 값으로 굴러간다. 두 곳 이상이면 `‹ 1/3 ›`로 넘긴다. */
export function TodayFanpageBanner({ items, locale }: { items: readonly TodayFanpage[]; locale: AppLocale }) {
  const c = todayFanpageCopy(locale);
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const item = items[index % items.length]!;
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const format = (value: number) => value >= 10_000 ? compact.format(value) : value.toLocaleString(locale);
  const stats = ([["posts", item.posts], ["comments", item.comments], ["likes", item.likes], ["missions", item.missions]] as const).filter(([, value]) => value > 0);
  const move = (step: number) => setIndex((value) => (value + step + items.length) % items.length);
  return <section className={styles.banner} aria-label={c.label} aria-roledescription={items.length > 1 ? "carousel" : undefined} data-directory-block="today-fanpage">
    <Link key={item.slug} className={styles.link} href={`/${encodeURIComponent(item.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
      <span className={styles.photo}>
        <CreatorImage slug={item.slug} src={item.imageUrl} presentation="portrait" photos={undefined} alt="" width={400} height={400} sizes="(min-width: 64rem) 168px, 112px" priority />
      </span>
      <span className={styles.identity}>
        <FanTag tone="fan">{c.tag}</FanTag>
        <span className={styles.name}><FanHeading as="h2" variant="personal-page">{item.name}</FanHeading></span>
        <FanText role="meta">{[item.periodDays ? c.period(item.periodDays) : null, c.fans(format(item.fans))].filter(Boolean).join(" · ")}</FanText>
      </span>
      <span className={styles.stats}>
        {stats.map(([key, value]) => <span key={key} className={styles.stat}>
          <FanText role="meta">{c[key]}</FanText>
          <span className={`${numberStyles.number} ${numberStyles.md}`}><RollingNumber value={value} format={format} initialFromZero /></span>
        </span>)}
      </span>
      <FanText role="banner-action" className={styles.action}>{c.action}</FanText>
    </Link>
    {items.length > 1 ? <div className={styles.controls}>
      <FanAction variant="text" size="sm" ariaLabel={c.previous} onClick={() => move(-1)} leadingIcon={<ChevronLeft aria-hidden="true" />} />
      <FanText role="meta" aria-live="polite">{index + 1}/{items.length}</FanText>
      <FanAction variant="text" size="sm" ariaLabel={c.next} onClick={() => move(1)} leadingIcon={<ChevronRight aria-hidden="true" />} />
    </div> : null}
  </section>;
}
