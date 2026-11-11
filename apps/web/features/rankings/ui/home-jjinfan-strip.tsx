"use client";
import Link from "next/link";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Heart } from "@/components/fan-ui/fan-icons";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanDetailHref, jjinfanHearts, useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./home-jjinfan-strip.module.css";

/** Home 찐팬 100 strip (대표 2026-11-11): under the banner, one thin gauge for the one challenge in focus, the donation line, and the whole strip is the link
 * to the detail page. The gauge is hearts/100. No challenge on, or a failed read: it still shows, at 0, so the home has no blank band there. */
export function HomeJjinfanStrip({ locale }: { locale: AppLocale }) {
  const { loading, item } = useFeaturedChallenge(locale);
  if (loading) return <div className={styles.strip} aria-hidden="true" data-skeleton=""><FanSkeleton width="100%" height={72} /></div>;
  const target = item?.target ?? 100;
  const shown = jjinfanHearts(item);
  const percent = (shown / target) * 100;
  const title = rankingsText(locale, "jjTitle");
  return <Link className={styles.strip} href={jjinfanDetailHref(locale)} data-home-jjinfan-strip="" data-slug={item?.slug}>
    <span className={styles.head}>
      <FanIcon icon={Heart} size={16} filled className={styles.heart} />
      <FanText role="item" className={styles.title}>{title}</FanText>
      <FanText role="item" className={styles.count} data-fact="">{shown.toLocaleString(locale)}/{target.toLocaleString(locale)}</FanText>
    </span>
    <span className={styles.bar} role="meter" aria-label={item ? `${item.name} ${title}` : title} aria-valuemin={0} aria-valuemax={target} aria-valuenow={shown} aria-valuetext={`${shown}/${target}`}>
      <span className={styles.fill} style={{ width: `${percent}%` }} data-end={shown < target ? "live" : "full"} />
    </span>
    <FanText role="meta" className={styles.pitch}>{rankingsText(locale, "jjPitch")}</FanText>
  </Link>;
}
