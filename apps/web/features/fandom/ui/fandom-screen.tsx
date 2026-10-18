"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ArrowRight } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { CreatorImage } from "@/components/fan-ui/creator-image";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { LeaderboardPanel } from "@/features/fanpage/ui/leaderboard-panel";
import { LivePlatformMark } from "@/features/live-submissions/ui/live-platform-mark";
import { CreatorBalance } from "@/features/support/creator-balance";
import type { LiveEventResponse } from "@/features/live/domain/live-event";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { AppLocale } from "@/i18n/locales";
import { fandomCopy } from "@/i18n/catalogs/features__fandom";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { LiveParticipationPanel, type ParticipationPhase } from "./live-participation-panel";
import styles from "./fandom-screen.module.css";

const livePhase = (live?: LiveEventResponse): ParticipationPhase => live?.live.effectiveStatus === "live" ? "during" : live?.live.effectiveStatus === "ended" ? "after" : "before";
export function FandomScreen({ locale, creators, lives, initialCreator, initialLive, initialPhase, contentError = false }: {
  locale: AppLocale; creators: readonly PublishedCelebrity[]; lives: readonly LiveEventResponse[];
  initialCreator?: string; initialLive?: string; initialPhase?: ParticipationPhase; contentError?: boolean;
}) {
  const t = fandomCopy(locale), s = supportCopy(locale), auth = usePrivy(), session = useByUsSession();
  const [slug, setSlug] = useState(initialCreator ?? lives.find(item => item.live.slug === initialLive)?.live.celebrity.slug ?? creators[0]?.slug ?? "");
  const [liveSlug, setLiveSlug] = useState(initialLive);
  const [phase, setPhase] = useState<ParticipationPhase | undefined>(initialPhase);
  const [tab, setTab] = useState<"activity" | "live" | "ranking">("activity");
  const creator = creators.find(item => item.slug === slug) ?? creators[0];
  const creatorLives = lives.filter(item => item.live.celebrity.slug === creator?.slug && item.live.effectiveStatus !== "cancelled");
  const selectedLive = creatorLives.find(item => item.live.slug === liveSlug) ?? creatorLives[0];
  const currentPhase = phase ?? livePhase(selectedLive);
  const owned = auth.ready && auth.authenticated && session.ready;
  function updateQuery(values: Record<string, string | undefined>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history.replaceState(null, "", url);
  }
  return <FanAppFrame locale={locale} mainId="fandom-content" currentPath="/fandom"><FanContentContainer as="main" id="fandom-content" tabIndex={-1} className={styles.main}>
    <h1 className={styles.title}>{t.title}</h1>
    {contentError ? <FanState kind="error" title={s.error} actions={<FanAction href={`/fandom?locale=${locale}`}>{s.retry}</FanAction>} /> : !creator ? <FanState kind="empty" title={s.empty} actions={<FanAction href={`/celebrities?locale=${locale}`}>{t.explore}</FanAction>} /> : <>
      <nav className={styles.creators} aria-label={s.creator}>{creators.map(item => <button key={item.slug} type="button" aria-pressed={item.slug === creator.slug} onClick={() => { setSlug(item.slug); setLiveSlug(undefined); setPhase(undefined); updateQuery({ creator: item.slug, live: undefined, phase: undefined }); }}><CreatorAvatar slug={item.slug} src={item.image.url} photos={item.image.photos} position={item.image.position} size={48} /><span>{item.name}</span></button>)}</nav>
      <div className={styles.creatorLinks}><FanAction variant="text" href={`${creatorHomeHref(creator.slug)}?locale=${locale}`} >{creator.name} {t.official} ↗</FanAction><FanAction variant="text" href={`/celebrities?locale=${locale}`} >{t.explore} →</FanAction></div>
      <nav className={styles.tabs} aria-label={t.title}>{(["activity", "live", "ranking"] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{t[value]}</button>)}</nav>
      {tab === "ranking" ? <LeaderboardPanel key={creator.slug} slug={creator.slug} locale={locale} showGathering={false} /> : tab === "live" ? creatorLives.length ? <div className={styles.liveGrid}>{creatorLives.map(item => <LiveCard key={item.live.slug} data={item} locale={locale} />)}</div> : <FanState kind="empty" title={t.noLive} /> : <div className={styles.layout}>
        <div className={styles.activity}>
          {owned ? <CreatorBalance compact slug={creator.slug} name={creator.name} locale={locale} /> : <div className={styles.invitation}><h2>{t.activity}</h2><p>{t.guest}</p><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/fandom?locale=${locale}&creator=${creator.slug}`)}`}>{s.login}</FanAction></div>}
          <p className={styles.balanceHelp}>{t.contributionHelp}</p>
          {creatorLives.length > 1 && <label className={styles.liveSelector}>{t.live}<select value={selectedLive?.live.slug} onChange={event => { setLiveSlug(event.target.value); setPhase(undefined); updateQuery({ live: event.target.value, phase: undefined }); }}>{creatorLives.map(item => <option key={item.live.slug} value={item.live.slug}>{item.live.title}</option>)}</select></label>}
          {selectedLive ? <LiveParticipationPanel key={`${creator.slug}:${selectedLive.live.slug}`} slug={selectedLive.live.slug} creatorSlug={creator.slug} locale={locale} phase={currentPhase} onPhaseChange={value => { setPhase(value); updateQuery({ phase: value }); }} /> : <FanState kind="empty" title={t.noLive} />}
        </div>
        {selectedLive && <aside className={styles.nextLive}><LiveCard data={selectedLive} locale={locale} /></aside>}
      </div>}
    </>}
  </FanContentContainer></FanAppFrame>;
}

function LiveCard({ data, locale }: { data: LiveEventResponse; locale: AppLocale }) {
  const t = fandomCopy(locale), { live } = data;
  return <article className={styles.liveCard}><div className={styles.portrait}><CreatorImage slug={live.celebrity.slug} src={live.celebrity.image} photos={live.celebrity.photos} position={live.celebrity.imagePosition} alt={live.celebrity.name} width={640} height={640} sizes="(min-width: 1024px) 320px, calc(100vw - 64px)" /></div><div className={styles.liveCardBody}><div className={styles.liveMeta}><span data-live={live.effectiveStatus === "live"}>{t[livePhase(data)]}</span><LivePlatformMark provider={live.watch.provider} /></div><h2>{live.title}</h2><time dateTime={live.startsAt}>{new Date(live.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })} KST</time><FanAction fullWidth href={`/live/${encodeURIComponent(live.slug)}?locale=${locale}`} trailingIcon={<ArrowRight size={18} />}>{t.details}</FanAction></div></article>;
}
