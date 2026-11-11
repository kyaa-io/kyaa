"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import { challengeHref } from "./home-challenges";
import { challengeEndDate } from "./jjinfan-gauge";
import { jjinfanHearts, useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./jjinfan-detail.module.css";

/** Top of the 찐팬 100 detail page (대표 2026-11-11): the hearts gauge of the challenge in focus (0 when none is on or the read failed), the donation line and
 * places for the recipient and the fans' names. The administrator's last day and line come from the same read as the home strip. */
export function JjinfanChallengeDetail({ locale }: { locale: AppLocale }) {
  const { item } = useFeaturedChallenge(locale);
  const target = item?.target ?? 100, shown = jjinfanHearts(item);
  const title = rankingsText(locale, "jjTitle");
  const meta = [item?.endsOn ? rankingsText(locale, "jjUntil", [challengeEndDate(item.endsOn, locale)]) : null, item?.description || null].filter(Boolean).join(" · ");
  return <section id="jjinfan-challenge" className={styles.detail} aria-label={title} data-jjinfan-detail="">
    <div className={styles.block} data-jjinfan-gauge="">
      <FanHeading>{title}</FanHeading>
      <FanText role="item" as="p" className={styles.count}>{shown.toLocaleString(locale)}/{target.toLocaleString(locale)}{shown >= target ? <FanText role="label" className={styles.done}> {rankingsText(locale, "jjDone")}</FanText> : null}</FanText>
      <FanGauge value={shown} max={target} label={title} />
      {meta ? <FanText role="meta" as="p" className={styles.meta}>{meta}</FanText> : null}
    </div>
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "jjDonateTitle")}</FanHeading>
      <FanText role="body" as="p">{rankingsText(locale, "jjPitch")}</FanText>
      <FanText role="meta" as="p" data-pending="donation">{rankingsText(locale, "jjDonatePending")}</FanText>
    </div>
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "jjNamesTitle")}</FanHeading>
      <FanText role="meta" as="p" data-pending="names">{rankingsText(locale, "jjNamesPending")}</FanText>
    </div>
    {item ? <FanAction variant="secondary" href={challengeHref(item.slug, locale)}>{rankingsText(locale, "jjCheer")}</FanAction> : null}
  </section>;
}
