"use client";

import Link from "next/link";
import { Select } from "@base-ui/react/select";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, Check, ChevronDown, ChevronRight, Images, MessageCircle, UsersRound } from "lucide-react";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { type AppLocale, toContentLocale } from "@/i18n/locales";
import { communityCopy } from "@/i18n/catalogs/features__community";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanPostFeed } from "@/features/fan-posts/ui/fan-post-feed";
import { CertificationPanel } from "@/features/certification/ui/certification-panel";
import { LeaderboardPanel } from "@/features/fanpage/ui/leaderboard-panel";
import { LEADERBOARD_MIN_FANS } from "@/features/fanpage/domain/community";
import { fanCommunitySchema } from "@/features/fanpage/domain/fan-community";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { ResourceMessage } from "@/features/fanpage/ui/home-panels";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { COMMUNITY_TABS, communityHref, hotCommunities, type CommunityTab } from "../domain/navigation";
import styles from "./community.module.css";

const parseFans = (value: unknown) => fanCommunitySchema.parse(value);

function CommunityFans({ slug, locale, compact = false, mediaOnly = false }: { slug: string; locale: AppLocale; compact?: boolean; mediaOnly?: boolean }) {
  const copy = communityCopy(locale);
  const resource = useCommunityResource(`/api/celebrities/${slug}/fans?locale=${toContentLocale(locale)}`, parseFans);
  if (!compact && resource.state.status === "ready" && resource.state.data.fanCount >= LEADERBOARD_MIN_FANS) {
    return <LeaderboardPanel slug={slug} locale={locale} showGathering={false} />;
  }
  return <section className={styles.fans} aria-label={copy.recentFans}>
    <header><h2><UsersRound size={18} aria-hidden="true" />{copy.recentFans}</h2>
      {resource.state.status === "ready" && <span>{resource.state.data.fanCount.toLocaleString(locale)}{copy.countSuffix}</span>}
    </header>
    {resource.state.status === "ready" ? <>
      <p>{copy.fansIntro}</p>
      {resource.state.data.fans.length ? <ul className={compact ? styles.fanPreview : styles.fanList}>
        {resource.state.data.fans.slice(0, compact ? 6 : 24).map((fan, index) => <li key={`${fan.nickname}:${index}`}><img src={fan.avatarUrl} width={40} height={40} alt="" /><span>{fan.nickname}</span></li>)}
      </ul> : <p className={styles.empty}>{copy.noFans}</p>}
      {compact && <Link className={styles.textLink} href={communityHref(slug, locale, "fans", mediaOnly)}>{copy.fans}<ArrowRight size={16} aria-hidden="true" /></Link>}
      {resource.refreshFailed && <ResourceMessage locale={locale} error retry={resource.retry} />}
    </> : <ResourceMessage locale={locale} error={resource.state.status === "error"} retry={resource.retry} />}
  </section>;
}

export function CommunityScreen({ creators, creator, locale, tab = "posts", mediaOnly = false }: {
  creators: readonly PublishedCelebrity[]; creator?: PublishedCelebrity; locale: AppLocale; tab?: CommunityTab; mediaOnly?: boolean;
}) {
  const copy = communityCopy(locale), participation = participationCopy(locale), router = useRouter();
  const hot = hotCommunities(creators);
  return <FanAppFrame locale={locale} currentPath="/community" mainId="community-main">
    <FanContentContainer as="main" id="community-main" className={styles.page} tabIndex={-1}>
      <header className={styles.creatorBar}>
        <div className={styles.breadcrumb}>
          <FanHeading as="h1" variant="editorial">{copy.title}</FanHeading>
          {creator && <><ChevronRight className={styles.separator} size={18} aria-hidden="true" />
          <div className={styles.selector}>
            <Select.Root value={creator.slug} onValueChange={value => { if (value && value !== creator.slug) router.push(communityHref(value, locale, tab, mediaOnly)); }}>
              <Select.Trigger className={styles.creatorSelect} aria-label={copy.choose}><Select.Value>{creator.name}</Select.Value><Select.Icon><ChevronDown size={18} aria-hidden="true" /></Select.Icon></Select.Trigger>
              <Select.Portal><Select.Positioner className={styles.selectPositioner} sideOffset={8} align="start" alignItemWithTrigger={false}>
                <Select.Popup className={styles.selectPopup}><Select.List className={styles.selectList}>
                  {creators.map(item => <Select.Item className={styles.selectItem} value={item.slug} key={item.slug}><Select.ItemText>{item.name}</Select.ItemText><Select.ItemIndicator><Check size={18} aria-hidden="true" /></Select.ItemIndicator></Select.Item>)}
                </Select.List></Select.Popup>
              </Select.Positioner></Select.Portal>
            </Select.Root>
          </div></>}
        </div>
        {creator && <div className={styles.destinations}>
          <Link className={styles.creatorLink} href={`${creatorHomeHref(creator.slug)}?locale=${locale}`}>{copy.fanpage}<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link className={styles.liveLink} href={`${creatorHomeHref(creator.slug)}?tab=live&locale=${locale}#celebrity-content`}><CalendarDays size={16} aria-hidden="true" />LIVE</Link>
        </div>}
      </header>
      {creator ? <>
        <nav className={styles.tabs} aria-label={copy.title}>{COMMUNITY_TABS.map(value => <Link key={value} href={communityHref(creator.slug, locale, value, mediaOnly)} aria-current={tab === value ? "page" : undefined}>{copy[value]}</Link>)}</nav>
        <div className={styles.layout}>
          {hot.length > 0 && <section className={styles.hot} aria-labelledby="hot-community-heading">
            <header><FanHeading as="h2" id="hot-community-heading">{copy.hot}</FanHeading><p>{copy.hotBasis}</p></header>
            <ol>{hot.map((item, index) => <li key={item.slug}>
              <Link href={communityHref(item.slug, locale, "posts", mediaOnly)} aria-current={item.slug === creator.slug ? "page" : undefined}>
                <span className={styles.rank}>{index + 1}</span>
                <CreatorAvatar slug={item.slug} src={item.image.url} photos={item.image.photos} position={item.image.position} size={36} />
                <span className={styles.hotIdentity}><strong>{item.name}</strong><span>{item.fanCount.toLocaleString(locale)}{copy.countSuffix}</span></span>
              </Link>
            </li>)}</ol>
          </section>}
          <div className={styles.mainColumn} key={`${creator.slug}:${tab}`}>
            {tab === "posts" ? <>
              <nav className={styles.mediaFilters} aria-label={copy.posts}>
                <Link href={communityHref(creator.slug, locale)} aria-current={!mediaOnly ? "page" : undefined}>{copy.allPosts}</Link>
                <Link href={communityHref(creator.slug, locale, "posts", true)} aria-current={mediaOnly ? "page" : undefined}><Images size={18} aria-hidden="true" />{copy.mediaOnly}</Link>
              </nav>
              <FanPostFeed slug={creator.slug} locale={locale} mediaOnly={mediaOnly} hideHeading intro="" returnTo={communityHref(creator.slug, locale, "posts", mediaOnly)} />
            </>
              : tab === "fans" ? <CommunityFans slug={creator.slug} locale={locale} />
              : tab === "certifications" ? <CertificationPanel slug={creator.slug} locale={locale} />
              : <section className={styles.requests}><h2>{copy.requests}</h2>
                <Link href={`/c/${creator.slug}/schedule-suggestions?locale=${locale}`}><CalendarDays aria-hidden="true" /><span>{participation.suggest}<small>{creator.name}</small></span><ArrowRight aria-hidden="true" /></Link>
                <Link href={`/bias/requests?locale=${locale}`}><UsersRound aria-hidden="true" /><span>{participation.fanpage}</span><ArrowRight aria-hidden="true" /></Link>
                <Link href={`/my/requests?locale=${locale}`}><MessageCircle aria-hidden="true" /><span>{participation.requests}</span><ArrowRight aria-hidden="true" /></Link>
              </section>}
          </div>
          <aside className={styles.sidebar}>
            {tab !== "fans" && <CommunityFans slug={creator.slug} locale={locale} mediaOnly={mediaOnly} compact />}
            {tab !== "certifications" && <section className={styles.verify}><BadgeCheck size={24} aria-hidden="true" /><h2>{copy.certifications}</h2><p>{copy.verifyIntro}</p><Link className={styles.textLink} href={communityHref(creator.slug, locale, "certifications", mediaOnly)}>{copy.certifications}<ArrowRight size={16} aria-hidden="true" /></Link></section>}
          </aside>
        </div>
      </> : <p className={styles.empty} role="status">{copy.empty}</p>}
    </FanContentContainer>
  </FanAppFrame>;
}
