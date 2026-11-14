import Image from "next/image";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { AppLocale } from "@/i18n/locales";
import { pickCreatorPromoBanner } from "../domain/creator-promo-banners";
import styles from "./creator-promo-banners.module.css";

/** 모임 맨 위 크리에이터 홍보 배너 1장. 그림 한 장이 전부인 링크(5:2)이며 넘기기·캐러셀이 없다. 고르는 기준은 이번 주 활동 1위(`order`의 첫 slug)이고 숫자는 화면에 내지 않는다. 이름은 그림 안 레터링과 `alt`에만 있다. */
export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  const banner = pickCreatorPromoBanner(order);
  return <section className={styles.section} data-directory-block="creator-promo">
    <Link className={styles.link} href={`/${encodeURIComponent(banner.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
      <Image src={banner.image} alt={locale === "ko" ? banner.nameKo : banner.nameEn} width={1500} height={600} sizes="(min-width: 48rem) 672px, 100vw" priority draggable={false} />
    </Link>
  </section>;
}
