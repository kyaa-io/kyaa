"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import { defaultHeartDonationEvent, type HeartDonationEvent } from "../domain/heart-donation";
import { challengeHref } from "./home-challenges";
import { challengeEndDate } from "./jjinfan-gauge";
import { heartDonationTitle } from "./heart-donation-copy";
import { jjinfanHearts, useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./jjinfan-detail.module.css";

/** The heart donation event page (대표 2026-11-11): the hearts gauge of the creator's page (0 when it is not on or the read failed), the donation line, the recipient
 * (`후원처 확정 후 안내` until one is set) and a place for the fans' names. The creator and the recipient are the settings; the cheer button goes to the creator's fan tab. */
export function HeartDonationDetail({ locale, event = defaultHeartDonationEvent }: { locale: AppLocale; event?: HeartDonationEvent }) {
  const { item } = useFeaturedChallenge(locale, event.creatorSlug);
  const target = item?.target ?? 100, shown = jjinfanHearts(item);
  const title = heartDonationTitle(locale, event, item?.name);
  const meta = [item?.endsOn ? rankingsText(locale, "jjUntil", [challengeEndDate(item.endsOn, locale)]) : null, item?.description || null].filter(Boolean).join(" · ");
  return <section className={`${styles.detail} ${styles.event}`} aria-label={title} data-heart-donation-detail="">
    <div className={styles.block} data-heart-donation-gauge="">
      <FanHeading as="h1">{title}</FanHeading>
      <FanText role="item" as="p" className={styles.count}>{shown.toLocaleString(locale)}/{target.toLocaleString(locale)}{shown >= target ? <FanText role="label" className={styles.done}> {rankingsText(locale, "jjDone")}</FanText> : null}</FanText>
      <FanGauge value={shown} max={target} label={title} />
      <FanText role="body" as="p">{rankingsText(locale, "hdPitch")}</FanText>
      {meta ? <FanText role="meta" as="p" className={styles.meta}>{meta}</FanText> : null}
    </div>
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "hdRecipientTitle")}</FanHeading>
      {event.recipient ? <FanText role="body" as="p" data-recipient="set">{event.recipient}</FanText> : <FanText role="body" as="p" data-pending="recipient">{rankingsText(locale, "hdRecipientPending")}</FanText>}
    </div>
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "jjNamesTitle")}</FanHeading>
      <FanText role="meta" as="p" data-pending="names">{rankingsText(locale, "hdNamesPending")}</FanText>
    </div>
    <FanAction variant="secondary" href={challengeHref(item?.slug ?? event.creatorSlug, locale)}>{rankingsText(locale, "jjCheer")}</FanAction>
  </section>;
}
