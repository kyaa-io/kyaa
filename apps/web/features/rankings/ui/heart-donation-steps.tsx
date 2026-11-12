"use client";
import type { CSSProperties, ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { Check } from "@/components/fan-ui/fan-icons";
import { FanText } from "@/components/fan-ui/fan-text";
import { fanLoginHref } from "@/components/login-href";
import { STAMPS_PER_HEART } from "@/features/groups/ui/stan-lucky-cheer";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { passportRoadmapSchema } from "@/features/passport/domain/dukjil-types";
import { openingPage } from "@/features/passport/ui/passport-mission-book";
import { MISSION_STAMP } from "@/features/passport/ui/passport-book-source";
import { fanVerifyHref } from "@/features/quiz/domain/live-return-context";
import { useSelectedBias } from "@/features/selected-bias/ui/use-selected-bias";
import type { AppLocale } from "@/i18n/locales";
import { heartDonationHref } from "../domain/heart-donation";
import { rankingsText } from "./rankings-copy";
import styles from "./heart-donation-steps.module.css";

const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);
/** The 덕질 actions that stamp the passport (ink-v1 art, the same files the mission book draws). */
const DUKJIL_STAMPS = (["checkin", "comment", "post", "share"] as const).map(kind => `/images/stamps/ink-v1/${MISSION_STAMP[kind].art}.webp`);
const GAUGE = { welcome: "/images/stamps/ink-v1/welcome.webp", stamp: "/images/passport/gauge/stamp.webp", heart: "/images/passport/gauge/heart.webp" } as const;

export type HeartStep = 1 | 2 | 3;

/** Where the viewer stands (대표 11/13 "어떻게 해야 참여할 수 있을지 가이드"): no passport of the creator → 1, stamps on the open page → 2, a full page to claim → 3. */
export function heartStep(hasPassport: boolean, claimable: boolean): HeartStep {
  if (!hasPassport) return 1;
  return claimable ? 3 : 2;
}

/** 참여 방법 on the heart donation page: three rows (패스포트 받기 · 스탬프 9개 · 하트 받기), the current one carries the one action, done rows a check.
 * The stamps row is the open passport page as a 9-segment FanGauge with the 덕질 stamp art (출석·댓글·글·공유) pressed in once; the action opens the creator's mission book, where hearts are claimed. */
export function HeartDonationSteps({ locale, slug, creator }: { locale: AppLocale; slug: string; creator: string }) {
  const auth = useGroupRequest(), bias = useSelectedBias(locale);
  const passport = bias.options.find(option => option.slug === slug) ?? null;
  const roadmap = useGroupResource(auth.authenticated && passport ? `/api/me/passports/${encodeURIComponent(passport.passportId)}/roadmap` : null, parseRoadmap);
  const page = roadmap.data ? roadmap.data.pages[openingPage(roadmap.data.pages)] : undefined;
  const filled = page ? (page.claimed ? 0 : page.filled) : 0, claimable = Boolean(page?.claimable && !page.claimed);
  const step = heartStep(Boolean(passport), claimable);
  const back = heartDonationHref(locale), verify = fanVerifyHref(slug, locale, back);
  const book = passport ? `/passports/${encodeURIComponent(passport.passportId)}?locale=${locale}#mission-book` : null;
  const action = (at: HeartStep, label: string, href: string | null): ReactNode => {
    if (at < step) return <FanText role="label" className={styles.done} data-step-done=""><FanIcon icon={Check} size={16} />{rankingsText(locale, "hdStepDone")}</FanText>;
    if (at > step || !href) return null;
    return <FanAction variant="primary" size="sm" href={href}>{label}</FanAction>;
  };
  return <section className={styles.steps} aria-labelledby="heart-steps-title" data-block="heart-steps" data-step={step}>
    <FanHeading id="heart-steps-title">{rankingsText(locale, "hdStepsTitle")}</FanHeading>
    <ol className={styles.list}>
      <li className={styles.row} data-row="" data-current={step === 1 || undefined}>
        <img className={styles.art} src={GAUGE.welcome} alt="" width={44} height={44} />
        <FanText role="item" className={styles.title}>{rankingsText(locale, "hdStepPassport", [creator])}</FanText>
        {action(1, rankingsText(locale, "hdStepPassportGo"), auth.authenticated ? verify : fanLoginHref(locale, verify))}
      </li>
      <li className={styles.row} data-row="" data-current={step === 2 || undefined}>
        <img className={styles.art} src={GAUGE.stamp} alt="" width={44} height={44} />
        <span className={styles.body}>
          <FanText role="item" className={styles.title}>{rankingsText(locale, "hdStepStamps", [STAMPS_PER_HEART])}</FanText>
          <FanGauge size="sm" value={filled} max={STAMPS_PER_HEART} segments={STAMPS_PER_HEART} valueText={`${filled}/${STAMPS_PER_HEART}`} label={rankingsText(locale, "hdStepStamps", [STAMPS_PER_HEART])} />
          <span className={styles.stamps} role="img" aria-label={rankingsText(locale, "hdStepStampKinds")}>
            {DUKJIL_STAMPS.map((src, index) => <img key={src} src={src} alt="" width={24} height={24} style={{ "--stamp-index": index } as CSSProperties} />)}
          </span>
        </span>
        {action(2, rankingsText(locale, "hdStepStampsGo"), book)}
      </li>
      <li className={styles.row} data-row="" data-current={step === 3 || undefined}>
        <img className={styles.art} src={GAUGE.heart} alt="" width={44} height={44} />
        <span className={styles.body}>
          <FanText role="item" className={styles.title}>{rankingsText(locale, "hdStepHeart")}</FanText>
          <FanText role="meta" className={styles.meta}>{rankingsText(locale, "hdStepHeartValue")}</FanText>
        </span>
        {action(3, rankingsText(locale, "hdStepHeartGo"), book)}
      </li>
    </ol>
  </section>;
}
