"use client";

import { ArrowRight, Lock } from "lucide-react";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { activeToday, parseDukjilToday } from "@/features/dukjil/domain/dukjil-ui";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { messages as lockedMessages } from "@/i18n/catalogs/components__fan-ui__fan-locked-value";
import { messages as fanLinkMessages } from "@/i18n/catalogs/components__fan-ui__creator-fan-link";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import type { MySummary } from "../domain/my-summary";
import { myHomeText } from "./my-home-copy";
import { usePassportBook } from "./my-passport-card";
import styles from "./my-favorites.module.css";

type Creator = MySummary["creators"][number];

export type MyFavoritesLabels = { title: string; find: string; empty: string };

function Favorite({ creator, locale }: { creator: Creator; locale: AppLocale }) {
  const dukjil = useDukjil();
  const slug = creator.celebrity.slug;
  const today = useGroupResource(dukjil?.status === "on" ? `/api/me/dukjil/today?creator=${encodeURIComponent(slug)}` : null, parseDukjilToday);
  const book = usePassportBook(creator.passport?.id);
  const streak = activeToday(today.data)?.attendance?.streak ?? 0;
  const filled = book.page?.filled;
  const pending = dukjil?.status === "loading" || (dukjil?.status === "on" && (today.loading || book.status === "loading"));
  const parts = [streak > 0 ? myHomeText(locale, "streakDays", [streak]) : null, filled !== undefined ? myHomeText(locale, "stampProgress", [filled, book.page?.slots.length ?? 9]) : null].filter(Boolean);
  const label = locale === "ko" ? "팬페이지 보기" : translate(locale, fanLinkMessages.m3c982b122f61, "View fan page");
  return <li className={styles.favorite}>
    <CreatorImage slug={slug} src={creator.celebrity.image} photos={creator.celebrity.photos} position={creator.celebrity.imagePosition} presentation="portrait" framed width={88} height={88} sizes="88px" alt="" />
    <div className={styles.copy}>
      <h3>{creator.celebrity.name}</h3>
      <p className={styles.meta}>{pending && parts.length === 0 ? <FanSkeleton width={120} height={14} /> : parts.join(" · ")}</p>
    </div>
    {creator.celebrity.isPublic !== false ? <FanAction variant="text" trailingIcon={<ArrowRight />} href={`${creatorHomeHref(slug)}?locale=${locale}`}>{label}</FanAction> : null}
  </li>;
}

/** 최애를 읽는 동안의 구역. 실제 행과 같은 크기의 두 행을 둔다. */
export function MyFavoritesSkeleton({ title }: { title: string }) {
  return <section className={styles.section} aria-label={title}>
    <header><h2>{title}</h2></header>
    <ul aria-hidden="true">{[0, 1].map((index) => <li className={styles.favorite} key={index}><FanSkeleton shape="block" width={88} height={88} /><div className={styles.copy}><FanSkeleton width="50%" height={24} /><FanSkeleton width={120} height={14} /></div></li>)}</ul>
  </section>;
}

/** 내 최애: 사진을 크게 쓰고 연속 일수와 도장 진행을 한 줄로 붙인다. 값은 실제 응답이다. */
export function MyFavorites({ creators, locale, labels }: { creators: Creator[]; locale: AppLocale; labels: MyFavoritesLabels }) {
  return <section className={styles.section} aria-labelledby="my-favorites-title">
    <header><h2 id="my-favorites-title">{labels.title}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={`/celebrities?locale=${locale}`}>{labels.find}</FanAction></header>
    {creators.length ? <ul>{creators.map((creator) => <Favorite key={creator.celebrity.slug} creator={creator} locale={locale} />)}</ul>
      : <div className={styles.empty}><p>{labels.empty}</p></div>}
  </section>;
}

/** 비로그인 최애 자리. 움직이지 않는 점선 아바타와 잠금 표시 한 줄로 내 값이 들어올 자리임을 보이고, `최애 찾기`로 이어진다. 회색 막대는 로딩으로 읽혀 쓰지 않는다. */
export function MyGuestFavorites({ locale, labels }: { locale: AppLocale; labels: MyFavoritesLabels }) {
  return <section className={styles.section} aria-labelledby="my-favorites-title">
    <header><h2 id="my-favorites-title">{labels.title}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={`/celebrities?locale=${locale}`}>{labels.find}</FanAction></header>
    <div className={styles.lockedRow}><span aria-hidden="true"><Lock /></span><p>{locale === "ko" ? "로그인 후 확인" : translate(locale, lockedMessages.m1dcdb3d77594, "Sign in to view")}</p></div>
  </section>;
}
