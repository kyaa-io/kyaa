import Image from "next/image";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanScrollRow } from "@/components/fan-ui/fan-scroll-row";
import type { AppLocale } from "@/i18n/locales";
import { orderCreatorPromoBanners } from "../domain/creator-promo-banners";
import styles from "./creator-promo-banners.module.css";

/** 모임 맨 위 크리에이터 홍보 배너 줄. 한 칸 = 그림 한 장이 전부인 링크(5:2). 순서는 이번 주 활동 순(`order`)이며 숫자는 화면에 내지 않는다. 글자·숫자·버튼을 HTML로 그리지 않고, 이름은 `alt`에만 둔다. */
export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  return <section className={styles.section} data-directory-block="creator-promo">
    <FanScrollRow className={styles.rail} locale={locale}>
      {orderCreatorPromoBanners(order).map((banner, index) => <li key={banner.slug} data-row="creator-promo">
        <Link className={styles.link} href={`/${encodeURIComponent(banner.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
          <Image src={banner.image} alt={locale === "ko" ? banner.nameKo : banner.nameEn} width={1500} height={600} sizes="(min-width: 80rem) 672px, (min-width: 48rem) 50vw, 100vw" priority={index < 3} draggable={false} />
        </Link>
      </li>)}
    </FanScrollRow>
  </section>;
}
