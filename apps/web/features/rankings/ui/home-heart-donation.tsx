"use client";
import Link from "next/link";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Heart } from "@/components/fan-ui/fan-icons";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { defaultHeartDonationEvent, heartDonationHref, type HeartDonationEvent } from "../domain/heart-donation";
import { heartDonationTitle } from "./heart-donation-copy";
import { jjinfanHearts, useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./home-heart-donation.module.css";

/** Home heart donation strip (대표 2026-11-11): under the banner, one thin gauge for `<creator>와 함께 찐팬 하트로 후원하기`, the donation line, and the whole strip is the
 * link to the event page. The gauge is the hearts of that creator's page over 100. The creator not on, or a failed read: it still shows, at 0, so the home has no blank band there. */
export function HomeHeartDonation({ locale, event = defaultHeartDonationEvent }: { locale: AppLocale; event?: HeartDonationEvent }) {
  const { loading, item } = useFeaturedChallenge(locale, event.creatorSlug);
  if (loading) return <div className={styles.strip} aria-hidden="true" data-skeleton=""><FanSkeleton width="100%" height={72} /></div>;
  const target = item?.target ?? 100;
  const shown = jjinfanHearts(item);
  const title = heartDonationTitle(locale, event, item?.name);
  return <Link className={styles.strip} href={heartDonationHref(locale)} data-home-heart-donation="" data-slug={event.creatorSlug}>
    <span className={styles.head}>
      <FanIcon icon={Heart} size={16} filled className={styles.heart} />
      <FanText role="item" className={styles.title}>{title}</FanText>
      <FanText role="item" className={styles.count} data-fact="">{shown.toLocaleString(locale)}/{target.toLocaleString(locale)}</FanText>
    </span>
    <span className={styles.bar} role="meter" aria-label={title} aria-valuemin={0} aria-valuemax={target} aria-valuenow={shown} aria-valuetext={`${shown}/${target}`}>
      <span className={styles.fill} style={{ width: `${(shown / target) * 100}%` }} data-end={shown < target ? "live" : "full"} />
    </span>
    <FanText role="meta" className={styles.pitch}>{rankingsText(locale, "hdPitch")}</FanText>
  </Link>;
}
