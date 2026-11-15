import Image from "next/image";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { pickCreatorPromoBanner, pickNextCreatorPromoBanner, type CreatorPromoBanner } from "../domain/creator-promo-banners";
import { todayFanpageCopy } from "./today-fanpage-copy";
import styles from "./creator-promo-banners.module.css";

/** 모임 맨 위 '오늘의 팬페이지' 구역: 제목 + 크리에이터 홍보 배너. 그림 한 장이 전부인 링크이며 넘기기·캐러셀이 없다. 고르는 기준은 이번 주 활동 순(`order`)이고 숫자는 화면에 내지 않는다. 이름은 그림 안 레터링과 `alt`에만 있다.
 * 1024 미만은 1위 한 장(5:2, 폭 상한 920). 1024 이상은 1위와 바로 다음 장을 같은 폭으로 한 줄에 나란히 걸어 본문 폭을 꽉 채운다(두 번째 장은 1024 미만에서 DOM에는 있되 보이지 않는다). */
export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  const title = todayFanpageCopy(locale).tag;
  const first = pickCreatorPromoBanner(order);
  const second = pickNextCreatorPromoBanner(order);
  const banner = (item: CreatorPromoBanner, side: "first" | "second") => <Link key={item.slug} className={styles.link} data-side={side} href={`/${encodeURIComponent(item.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
    <Image src={item.image} alt={locale === "ko" ? item.nameKo : item.nameEn} width={1500} height={600} sizes="(min-width: 64rem) 672px, (min-width: 48rem) 920px, 100vw" priority={side === "first"} loading={side === "first" ? undefined : "lazy"} draggable={false} />
  </Link>;
  return <section className={styles.section} aria-labelledby="directory-promo-title" data-directory-block="creator-promo">
    <FanHeading id="directory-promo-title">{title}</FanHeading>
    <div className={styles.row}>{banner(first, "first")}{banner(second, "second")}</div>
  </section>;
}
