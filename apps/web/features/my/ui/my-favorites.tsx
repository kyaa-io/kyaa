"use client";

import { Lock } from "lucide-react";
import { FanEntityCard } from "@/components/fan-ui/fan-entity-card";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { messages as lockedMessages } from "@/i18n/catalogs/components__fan-ui__fan-locked-value";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import type { MySummary } from "../domain/my-summary";
import styles from "./my-favorites.module.css";

type Creator = MySummary["creators"][number];

export type MyFavoritesLabels = { title: string; find: string; empty: string };

function Favorite({ creator, locale }: { creator: Creator; locale: AppLocale }) {
  const slug = creator.celebrity.slug;
  return <li role="listitem"><FanEntityCard size="tile" href={`${creatorHomeHref(slug)}?locale=${locale}`} image={{ slug, src: creator.celebrity.image, photos: creator.celebrity.photos, position: creator.celebrity.imagePosition }} name={creator.celebrity.name} kind="fan" locale={locale} disabled={creator.celebrity.isPublic === false} /></li>;
}

/** 최애를 읽는 동안의 구역. */
export function MyFavoritesSkeleton({ title }: { title: string }) {
  return <section className={styles.section} aria-label={title}>
    <header><h2>{title}</h2></header>
    <ul aria-hidden="true">{[0, 1, 2].map((index) => <li key={index}><span className={styles.loadingTile}><FanSkeleton shape="block" width="100%" height="100%" /><FanSkeleton width="70%" height={18} /></span></li>)}</ul>
  </section>;
}

/** 내 최애: 패스포트를 보유한 크리에이터의 사진과 이름. */
export function MyFavorites({ creators, locale, labels }: { creators: Creator[]; locale: AppLocale; labels: MyFavoritesLabels }) {
  return <section className={styles.section} aria-labelledby="my-favorites-title">
    <header><h2 id="my-favorites-title">{labels.title}</h2><FanSectionLink href={`/celebrities?locale=${locale}`}>{labels.find}</FanSectionLink></header>
    {creators.length ? <ul role="list">{creators.map((creator) => <Favorite key={creator.celebrity.slug} creator={creator} locale={locale} />)}</ul>
      : <div className={styles.empty}><p>{labels.empty}</p></div>}
  </section>;
}

/** 비로그인 최애 자리. 움직이지 않는 점선 아바타와 잠금 표시 한 줄로 내 값이 들어올 자리임을 보이고, `최애 찾기`로 이어진다. 회색 막대는 로딩으로 읽혀 쓰지 않는다. */
export function MyGuestFavorites({ locale, labels }: { locale: AppLocale; labels: MyFavoritesLabels }) {
  return <section className={styles.section} aria-labelledby="my-favorites-title">
    <header><h2 id="my-favorites-title">{labels.title}</h2><FanSectionLink href={`/celebrities?locale=${locale}`}>{labels.find}</FanSectionLink></header>
    <div className={styles.lockedRow}><span aria-hidden="true"><Lock /></span><p>{locale === "ko" ? "로그인 후 확인" : translate(locale, lockedMessages.m1dcdb3d77594, "Sign in to view")}</p></div>
  </section>;
}
