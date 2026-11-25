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

export function CreatorPromoBanners({ locale, order }: { locale: AppLocale; order?: readonly string[] }) {
  const title = todayFanpageCopy(locale).tag;
  const banner = pickCreatorPromoBanner(order);
  const edges = { "--promo-left": banner.leftColor, "--promo-right": banner.rightColor } as CSSProperties;
  return <section className={styles.section} aria-labelledby="directory-promo-title" data-directory-block="creator-promo">
    <FanHeading id="directory-promo-title">{title}</FanHeading>
    <Link className={styles.link} style={edges} href={`/${encodeURIComponent(banner.slug)}?locale=${encodeURIComponent(locale)}` as Route}>
      <Image src={banner.image} alt={creatorName(banner.slug, locale, locale === "ko" ? banner.nameKo : banner.nameEn)} width={1500} height={600} sizes="100vw" priority draggable={false} />
    </Link>
  </section>;
}
