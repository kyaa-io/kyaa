"use client";

import Link from "next/link";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { discoveryCopy } from "@/i18n/catalogs/features__fan_posts__discovery";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { communityHref } from "@/features/community/domain/navigation";
import { publicHomeFeedSchema } from "@/features/fan-posts/domain/home-feed";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { FanSectionHeader } from "./fan-ui/fan-heading";
import styles from "./home-community-preview.module.css";

const parse = (value: unknown) => ({
  items: publicHomeFeedSchema.parse(value).items
    .filter(({ item }) => item.kind === "cheer" || item.visibility === "public")
    .sort((a, b) =>
      Number(b.item.kind === "fan_post" && (b.item.assets.length > 0 || !!b.item.video)) -
      Number(a.item.kind === "fan_post" && (a.item.assets.length > 0 || !!a.item.video)) ||
      Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt))
    .slice(0, 3),
});

export function HomeCommunityPreview({ locale }: { locale: AppLocale }) {
  const auth = useByUsAuth();
  const copy = contentCopy(locale), feed = feedCopy(locale);
  const { state, retry } = useCommunityResource(`/api/public/home-feed?locale=${toContentLocale(locale)}`, parse, true, true);
  return <section className={styles.section} aria-labelledby="home-community-heading">
    <FanSectionHeader variant="editorial" id="home-community-heading" title={feed.fanBoard} description={discoveryCopy(locale).communityIntro} />
    {state.status === "ready" && state.data.items.length > 0 ? <ul className={styles.posts}>{state.data.items.map(({ creatorSlug, creatorName, item }) => <li key={`${creatorSlug}:${item.kind}:${item.id}`}>
      <div className={styles.post}>
      {item.kind === "fan_post" && item.video && <div className={styles.media}><Link href={communityHref(creatorSlug, locale)} aria-label={waveMediaCopy(locale).play}>{auth.authenticated ? <AuthenticatedMedia asset={{ ...item.video, kind: "video" }} locale={locale} alt={waveMediaCopy(locale).play} retryable={false} /> : <span>{waveMediaCopy(locale).play} →</span>}</Link></div>}
      {item.kind === "fan_post" && !item.video && item.assets[0] && <div className={styles.media}><ContentAssetImage asset={item.assets[0]} locale={locale} alt={copy.photo} href={communityHref(creatorSlug, locale)} /></div>}
      <Link className={styles.postLink} href={communityHref(creatorSlug, locale)}>
        <span className={styles.board}>{creatorName} · {feed.fanBoard}</span>
        <p>{item.body || feed.fanBoard}</p>
        <div className={styles.meta}><span>{item.kind === "cheer" ? item.nickname : item.author.nickname}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(item.createdAt))}</time><span className={styles.more}>{feed.fanBoard}<span aria-hidden="true"> →</span></span></div>
      </Link></div>
    </li>)}</ul> : <p className={styles.status} role={state.status === "error" ? "alert" : "status"}>{state.status === "loading" ? copy.loading : state.status === "error" ? copy.failed : copy.empty}</p>}
    {state.status === "error" && <div className={styles.status}><button type="button" onClick={retry}>{copy.retry}</button></div>}
    {state.status === "ready" && state.data.items.length === 0 && <Link className={styles.emptyAction} href={`/community?locale=${locale}`}>{feed.fanBoard}<span aria-hidden="true"> →</span></Link>}
  </section>;
}
