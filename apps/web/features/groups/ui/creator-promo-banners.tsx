import Image from "next/image";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { PROMO_WIDE_SIZE, pickCreatorPromoBanner } from "../domain/creator-promo-banners";
import { todayFanpageCopy } from "./today-fanpage-copy";
import styles from "./creator-promo-banners.module.css";

/** 모임 맨 위 '오늘의 팬페이지' 구역: 제목 + 크리에이터 홍보 배너 1장. 그림 한 장이 전부인 링크이며 넘기기·캐러셀이 없다. 고르는 기준은 이번 주 활동 1위(`order`의 첫 slug)이고 숫자는 화면에 내지 않는다. 이름은 그림 안 레터링과 `alt`에만 있다.
 * 1024 이상에서 넓은 그림(`wideImage`, 1360×380)이 있으면 본문 폭을 꽉 채우고, 없으면 지금 그림(5:2)을 폭 상한 920으로 보여 준다. */
export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  const banner = pickCreatorPromoBanner(order);
  const title = todayFanpageCopy(locale).tag;
  const alt = locale === "ko" ? banner.nameKo : banner.nameEn;
  const picture = <Image src={banner.image} alt={alt} width={1500} height={600} sizes={banner.wideImage ? "(min-width: 64rem) 1360px, 100vw" : "(min-width: 48rem) 920px, 100vw"} priority draggable={false} />;
  return <section className={styles.section} aria-labelledby="directory-promo-title" data-directory-block="creator-promo">
    <FanHeading id="directory-promo-title">{title}</FanHeading>
    <Link className={styles.link} data-wide={banner.wideImage ? "" : undefined} href={`/${encodeURIComponent(banner.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
      {banner.wideImage
        ? <picture><source media="(min-width: 64rem)" srcSet={banner.wideImage} width={PROMO_WIDE_SIZE.width} height={PROMO_WIDE_SIZE.height} />{picture}</picture>
        : picture}
    </Link>
  </section>;
}
