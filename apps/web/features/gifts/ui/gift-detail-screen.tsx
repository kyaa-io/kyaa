"use client";

import Image from "next/image";
import { useCallback, useState, type ReactNode } from "react";
import { FanAppFrame, FanContentContainer, type FanLocale } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanBackAction } from "@/components/fan-ui/fan-back-action";
import { FanHeading, FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanUtilityCanvasClassName } from "@/components/fan-ui/fan-surface";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { withLocalePath } from "@/components/locale-path";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { RaffleResultPanel, raffleResultNeedsReveal } from "@/features/benefit/ui/raffle-result-panel";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { GuestLoginAction } from "@/features/my/ui/guest-login";
import { toContentLocale } from "@/i18n/locales";
import { giftDetailSchema, type Gift } from "../domain/gift";
import { GiftStages } from "./gift-stages";
import { giftText } from "./gift-text";
import { GiftViewedMarker } from "./gift-viewed-marker";
import styles from "./gift-detail-screen.module.css";

const parseDetail = (body: unknown) => giftDetailSchema.parse(body);

export function GiftDetailScreen({ locale, rewardResultId }: Readonly<{ locale: FanLocale; rewardResultId: string }>) {
  const auth = useByUsAuth();
  const identityKey = `${auth.ready}:${auth.authenticated}:${auth.user?.id ?? "guest"}:${rewardResultId}`;
  return <GiftDetailOwnerScreen key={identityKey} locale={locale} rewardResultId={rewardResultId} auth={auth} />;
}

/** 이미지 칸. 안 읽은 선물이면 뒤의 빛이 한 번 켜지고 멈춘다. 읽음으로 바뀌어도 이 방문 동안은 그대로 둔다. */
function GiftHero({ gift, glow }: Readonly<{ gift: Gift; glow: boolean }>) {
  const url = gift.result.imageUrl ?? "/images/my/shortcuts/rewards.webp";
  return <div className={styles.hero} data-gift-glow={glow ? "" : undefined}>
    {glow ? <img className={styles.glow} src="/images/gift/gift-halo.png" alt="" width={320} height={320} decoding="async" /> : null}
    <span className={styles.image}><Image src={url} alt="" fill priority sizes="(min-width: 768px) 240px, 60vw" unoptimized={bypassImageOptimization(url)} /></span>
  </div>;
}

function GiftDetailOwnerScreen({ locale, rewardResultId, auth }: Readonly<{ locale: FanLocale; rewardResultId: string; auth: ReturnType<typeof useByUsAuth> }>) {
  const parse = useCallback((body: unknown) => parseDetail(body), []);
  const resource = useOwnedFanResource(auth.authenticated ? `/api/me/gifts/${encodeURIComponent(rewardResultId)}?locale=${toContentLocale(locale)}` : null, parse, auth);
  // 읽음이 되어도 이 방문의 빛은 처음 읽은 상태를 따른다.
  const [glow, setGlow] = useState<boolean | null>(null);
  if (glow === null && resource.state.status === "ready") setGlow(resource.state.data.gift.unread);
  const heading = <header className={styles.heading}>
    <FanBackAction locale={locale} fallbackHref={withLocalePath("/my/gifts", locale)} />
    <FanSectionHeader as="h1" variant="personal" title={giftText(locale, "title")} action={{ href: withLocalePath("/my/raffles", locale), label: giftText(locale, "history") }} />
  </header>;
  let content: ReactNode;
  if (!auth.ready || resource.state.status === "loading") content = <FanSkeletonRows rows={3} variant="entity" ariaLabel={giftText(locale, "loading")} />;
  else if (!auth.authenticated) content = <section className={styles.guest} data-block="gift-guest"><FanLockedRows rows={3} /><GuestLoginAction locale={locale} returnTo={withLocalePath(`/my/gifts/${rewardResultId}`, locale)} variant="primary" fullWidth /></section>;
  else if (resource.state.status === "error" && resource.state.kind === "missing") content = <FanState kind="empty" title={giftText(locale, "notFound")} action={{ label: giftText(locale, "toList"), href: withLocalePath("/my/gifts", locale) }} />;
  else if (resource.state.status === "error") content = <FanState kind="error" title={giftText(locale, "error")} actions={<FanAction variant="neutral" onClick={resource.retry} >{giftText(locale, "retry")}</FanAction>} />;
  else {
    const { gift } = resource.state.data;
    const needsReveal = raffleResultNeedsReveal(gift.result);
    const marker = gift.unread ? <GiftViewedMarker rewardResultId={gift.rewardResultId} ownerId={auth.user?.id} getAccessToken={auth.getAccessToken} /> : null;
    content = <section className={styles.panel} data-block="gift-detail" aria-label={giftText(locale, "title")}>
      {needsReveal ? null : <>
        <GiftHero gift={gift} glow={glow === true} />
        <FanHeading as="h2" variant="personal-section"><TranslatedText text={gift.result.title} locale={locale} controls={false} /></FanHeading>
        <GiftStages result={gift.result} locale={locale} />
      </>}
      <RaffleResultPanel result={gift.result} locale={locale} embedded={!needsReveal} ownerId={auth.user?.id} viewedMarker={marker} />
      {needsReveal ? <GiftStages result={gift.result} locale={locale} /> : null}
    </section>;
  }
  return <FanAppFrame locale={locale} className={fanUtilityCanvasClassName} mainId="gift-content" currentPath="/my/gifts">
    <FanContentContainer as="main" className={styles.main} id="gift-content" tabIndex={-1}>
      {heading}
      <div className={styles.body}>{content}</div>
    </FanContentContainer>
  </FanAppFrame>;
}
