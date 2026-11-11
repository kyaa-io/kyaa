"use client";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { JjinfanGauge } from "./jjinfan-gauge";
import { challengeHref } from "./home-challenges";
import { useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./jjinfan-detail.module.css";

/** Top of the 찐팬 100 detail page (대표 2026-11-11): the gauge of the challenge in focus, the donation line and places for the recipient and the fans' names.
 * No challenge on: nothing, the page is the participation guide as before. */
export function JjinfanChallengeDetail({ locale }: { locale: AppLocale }) {
  const { item } = useFeaturedChallenge(locale);
  if (!item) return null;
  return <section id="jjinfan-challenge" className={styles.detail} aria-labelledby="jjinfan-donate-heading" data-jjinfan-detail="">
    <JjinfanGauge slug={item.slug} locale={locale} name={item.name} />
    <div className={styles.block}>
      <FanHeading id="jjinfan-donate-heading">{rankingsText(locale, "jjDonateTitle")}</FanHeading>
      <FanText role="body" as="p">{rankingsText(locale, "jjPitch")}</FanText>
      <FanText role="meta" as="p" data-pending="donation">{rankingsText(locale, "jjDonatePending")}</FanText>
    </div>
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "jjNamesTitle")}</FanHeading>
      <FanText role="meta" as="p" data-pending="names">{rankingsText(locale, "jjNamesPending")}</FanText>
    </div>
    <FanAction variant="secondary" href={challengeHref(item.slug, locale)}>{rankingsText(locale, "jjCheer")}</FanAction>
  </section>;
}
