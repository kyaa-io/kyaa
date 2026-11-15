import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bannerCategoryLabel } from "@/features/home/domain/banner-category";
import { localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";
import styles from "./home-thin-banner.module.css";

/**
 * One picture, no words laid over it, the whole strip is the link. 358×90 on 390, 1360×120 on 1440 (artwork 716×180 and 2720×240).
 * `size="mid"` is the 홈배너2 / 덕질배너1 row: the 찐팬100 row's box, 358×160 on 390 and 1360×240 from 768 (artwork 716×320 and 2720×480), no margin of its own.
 * `size="side"` is the 덕질배너2 column of the 덕질 tab on PC: 360×600 (artwork 720×1200, one image, no phone artwork), drawn only by a parent that shows it from 1280.
 */
export function ThinBanner({ banner, locale, size = "thin" }: { banner: HomeBanner; locale: AppLocale; size?: "thin" | "mid" | "side" }) {
  const href = localizedBannerHref(banner.href, locale);
  const external = !href.startsWith("/");
  const ad = banner.category === "ad";
  const mobile = size === "side" ? banner.desktopImage : banner.mobileImage ?? banner.desktopImage;
  const picture = <picture>
    {size !== "side" && <source media={size === "thin" ? "(min-width: 64rem)" : "(min-width: 48rem)"} srcSet={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} />}
    <img src={mobile.url} width={mobile.width} height={mobile.height} alt={banner.alt || banner.title} loading="lazy" decoding="async" />
  </picture>;
  const mark = ad ? <FanTag tone="neutral" className={styles.tag}>{bannerCategoryLabel("ad", locale)}</FanTag> : null;
  return <div className={size === "mid" ? `${styles.strip} ${styles.stripMid}` : size === "side" ? `${styles.strip} ${styles.stripSide}` : styles.strip} data-home-thin-banner data-banner-id={banner.id} data-banner-size={size}>
    {external
      ? <a className={styles.link} href={href} target="_blank" rel={ad ? "sponsored noopener noreferrer" : "noopener noreferrer"} data-outbound-placement="content" data-outbound-kind="external">{picture}{mark}</a>
      : <Link className={styles.link} href={href as Route}>{picture}{mark}</Link>}
  </div>;
}
