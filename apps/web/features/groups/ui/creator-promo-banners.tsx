import Image from "next/image";
import type { Route } from "next";
import type { CSSProperties } from "react";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { pickCreatorPromoBanner } from "../domain/creator-promo-banners";
import { todayFanpageCopy } from "./today-fanpage-copy";
import styles from "./creator-promo-banners.module.css";
import { creatorName } from "@/features/fanpage/domain/creator-names";

/** 모임 맨 위 '오늘의 팬페이지' 구역: 제목 + 크리에이터 홍보 배너 한 장. 그림 한 장이 전부인 링크이며 넘기기·캐러셀이 없다. 고르는 기준은 이번 주 활동 순(`order`)이고 숫자는 화면에 내지 않는다. 이름은 그림 안 레터링과 `alt`에만 있다.
 * 1024 미만은 그림이 칸을 꽉 채운다(5:2, 폭 상한 920). 1024 이상은 칸이 제목·'내 아티스트' 카드와 같은 전체 폭이고, 그림은 원본 5:2 그대로 가운데에 두며 남는 양옆을 그림 가장자리 색으로 채운다(`leftColor`·`rightColor`). */
export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  const title = todayFanpageCopy(locale).tag;
  const banner = pickCreatorPromoBanner(order);
  const edges = { "--promo-left": banner.leftColor, "--promo-right": banner.rightColor } as CSSProperties;
  return <section className={styles.section} aria-labelledby="directory-promo-title" data-directory-block="creator-promo">
    <FanHeading id="directory-promo-title">{title}</FanHeading>
    <Link className={styles.link} style={edges} href={`/${encodeURIComponent(banner.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
      <Image src={banner.image} alt={creatorName(banner.slug, locale, locale === "ko" ? banner.nameKo : banner.nameEn)} width={1500} height={600} sizes="(min-width: 64rem) 900px, (min-width: 48rem) 920px, 100vw" priority draggable={false} />
    </Link>
  </section>;
}
