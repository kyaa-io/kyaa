"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, type ReactNode } from "react";
import { FanAppFrame, FanContentContainer, type FanLocale } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanBackAction } from "@/components/fan-ui/fan-back-action";
import { FanDot } from "@/components/fan-ui/fan-dot";
import { FanHeading, FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanSurface, fanUtilityCanvasClassName } from "@/components/fan-ui/fan-surface";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { withLocalePath } from "@/components/locale-path";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { GuestLoginAction } from "@/features/my/ui/guest-login";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { toContentLocale } from "@/i18n/locales";
import { giftListSchema, giftPath, type Gift } from "../domain/gift";
import { giftTrack } from "./gift-stages";
import { giftText, type GiftTextKey } from "./gift-text";
import styles from "./gifts-screen.module.css";

const parseList = (body: unknown) => giftListSchema.parse(body);

/** 선물 한 줄의 상태 태그: 지금 단계의 이름. 수령 정보가 필요하면 그 행동 이름이다. */
export function giftStatusKey(gift: Gift): GiftTextKey {
  const track = giftTrack(gift.result);
  if (gift.result.fulfillmentStatus === "information_required") return "tagInfo";
  return track ? track.steps[track.at] : "stageInfo";
}
const completed = (gift: Gift) => ["shipping_completed", "pickup_completed", "digital_delivered"].includes(gift.result.fulfillmentStatus ?? "");

export function groupGifts(gifts: readonly Gift[]) {
  return {
    fresh: gifts.filter((gift) => gift.unread),
    progress: gifts.filter((gift) => !gift.unread && !completed(gift)),
    received: gifts.filter((gift) => !gift.unread && completed(gift)),
  };
}

export function GiftThumb({ gift, size }: Readonly<{ gift: Gift; size: number }>) {
  const url = gift.result.imageUrl ?? "/images/my/shortcuts/rewards.webp";
  return <span className={styles.thumb} data-unread={gift.unread ? "" : undefined}>
    {gift.unread ? <img className={styles.thumbHalo} src="/images/gift/gift-halo.png" alt="" width={size + 24} height={size + 24} decoding="async" /> : null}
    <span className={styles.thumbFrame}><Image src={url} alt="" fill sizes={`${size}px`} unoptimized={bypassImageOptimization(url)} /></span>
  </span>;
}

function formatDate(value: string, locale: FanLocale) {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function GiftRow({ gift, locale }: Readonly<{ gift: Gift; locale: FanLocale }>) {
  const tag = giftStatusKey(gift);
  return <li data-row="" className={styles.item}>
    <Link className={styles.row} href={`${giftPath(gift.rewardResultId)}?locale=${locale}` as Route}>
      <GiftThumb gift={gift} size={64} />
      <span className={styles.title}>{gift.unread ? <span className={styles.srOnly}>{giftText(locale, "sectionNew")}, </span> : null}<TranslatedText text={gift.result.title} locale={locale} controls={false} /></span>
      <FanTag tone={tag === "tagInfo" ? "notice" : "neutral"} className={styles.tag}>{giftText(locale, tag)}</FanTag>
      {gift.result.publishedAt ? <time className={styles.date} dateTime={gift.result.publishedAt}>{formatDate(gift.result.publishedAt, locale)}</time> : null}
      {gift.unread ? <FanDot className={styles.dot} /> : null}
    </Link>
  </li>;
}

function GiftSection({ title, gifts, locale }: Readonly<{ title: string; gifts: readonly Gift[]; locale: FanLocale }>) {
  if (gifts.length === 0) return null;
  return <section className={styles.section} data-block="gift-section" aria-label={title}>
    <FanSectionHeader variant="personal" title={title} />
    <FanSurface appearance="list"><ul>{gifts.map((gift) => <GiftRow key={gift.rewardResultId} gift={gift} locale={locale} />)}</ul></FanSurface>
  </section>;
}

export function GiftsScreen({ locale }: Readonly<{ locale: FanLocale }>) {
  const auth = useByUsAuth();
  const identityKey = `${auth.ready}:${auth.authenticated}:${auth.user?.id ?? "guest"}`;
  return <GiftsOwnerScreen key={identityKey} locale={locale} auth={auth} />;
}

function GiftsOwnerScreen({ locale, auth }: Readonly<{ locale: FanLocale; auth: ReturnType<typeof useByUsAuth> }>) {
  const parse = useCallback((body: unknown) => parseList(body), []);
  const resource = useOwnedFanResource(auth.authenticated ? `/api/me/gifts?locale=${toContentLocale(locale)}` : null, parse, auth);
  const title = giftText(locale, "title");
  const heading = <header className={styles.heading}>
    <FanBackAction locale={locale} fallbackHref={withLocalePath("/my", locale)} />
    <FanSectionHeader as="h1" variant="personal" title={title} action={{ href: withLocalePath("/my/raffles", locale), label: giftText(locale, "history") }} />
  </header>;
  const skeleton = <FanSkeletonRows rows={3} variant="entity" ariaLabel={giftText(locale, "loading")} />;
  let content: ReactNode;
  if (!auth.ready) content = skeleton;
  else if (!auth.authenticated) content = <section className={styles.guest} data-block="gift-guest"><FanLockedRows rows={3} /><GuestLoginAction locale={locale} returnTo={withLocalePath("/my/gifts", locale)} variant="primary" fullWidth /></section>;
  else if (resource.state.status === "loading") content = skeleton;
  else if (resource.state.status === "error") content = <FanState kind="error" title={giftText(locale, "error")} actions={<FanAction variant="neutral" onClick={resource.retry} >{giftText(locale, "retry")}</FanAction>} />;
  else if (resource.state.data.gifts.length === 0) content = <FanState kind="empty" title={giftText(locale, "empty")} action={{ label: giftText(locale, "browse"), href: withLocalePath("/benefits", locale) }} />;
  else {
    const groups = groupGifts(resource.state.data.gifts);
    content = <>
      <GiftSection title={giftText(locale, "sectionNew")} gifts={groups.fresh} locale={locale} />
      <GiftSection title={giftText(locale, "sectionProgress")} gifts={groups.progress} locale={locale} />
      <GiftSection title={giftText(locale, "sectionReceived")} gifts={groups.received} locale={locale} />
    </>;
  }
  return <FanAppFrame locale={locale} className={fanUtilityCanvasClassName} mainId="gifts-content" currentPath="/my/gifts">
    <FanContentContainer as="main" className={styles.main} id="gifts-content" tabIndex={-1}>
      {heading}
      <div className={styles.body}>{content}</div>
    </FanContentContainer>
  </FanAppFrame>;
}
