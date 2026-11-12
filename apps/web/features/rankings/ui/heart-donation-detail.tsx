"use client";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";
import { defaultHeartDonationEvent, type HeartDonationEvent } from "../domain/heart-donation";
import { seeAllLabel } from "@/features/groups/ui/group-directory";
import { challengeHref } from "./home-challenges";
import { challengeEndDate } from "./jjinfan-gauge";
import { heartDonationTitle } from "./heart-donation-copy";
import { HeartDonationSteps } from "./heart-donation-steps";
import { jjinfanHearts, useFeaturedChallenge } from "./jjinfan-featured";
import { rankingsText } from "./rankings-copy";
import styles from "./jjinfan-detail.module.css";

/** The heart donation event page (대표 2026-11-11): the hearts gauge of the creator's page (0 when it is not on or the read failed), the donation line, the recipient
 * (`후원처 확정 후 안내` until one is set) and a place for the fans' names. The creator and the recipient are the settings.
 * 대표 11/13 "누르면 팬페이지에서 멈추게 됨": the old 응원하러 가기 (fan tab, no next step) is replaced by 참여 방법 right under the gauge; the fan tab stays as 전체 보기 of 참여한 팬. */
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
    <HeartDonationSteps locale={locale} slug={item?.slug ?? event.creatorSlug} creator={item?.name || event.creatorName || rankingsText(locale, "hdCreatorDefault")} />
    <div className={styles.block}>
      <FanHeading>{rankingsText(locale, "hdRecipientTitle")}</FanHeading>
      {event.recipient ? <FanText role="body" as="p" data-recipient="set">{event.recipient}</FanText> : <FanText role="body" as="p" data-pending="recipient">{rankingsText(locale, "hdRecipientPending")}</FanText>}
    </div>
    <div className={styles.block}>
      <div className={styles.blockHead}><FanHeading>{rankingsText(locale, "jjNamesTitle")}</FanHeading><FanSectionLink href={challengeHref(item?.slug ?? event.creatorSlug, locale)}>{seeAllLabel[locale]}</FanSectionLink></div>
      <FanText role="meta" as="p" data-pending="names">{rankingsText(locale, "hdNamesPending")}</FanText>
    </div>
  </section>;
}
