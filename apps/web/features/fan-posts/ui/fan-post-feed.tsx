"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, MessageCircle, PenLine, X } from "lucide-react";
import { discoveryCopy } from "@/i18n/catalogs/features__fan_posts__discovery";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { waveNavigationCopy } from "@/i18n/catalogs/features__fanpage__wave-navigation";
import { waveProgramsCopy } from "@/i18n/catalogs/features__fanpage__wave-programs";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import type { NewsFilter } from "@/features/fanpage/ui/chzzk-posts";
import { boardHref, type BoardFeedSource } from "@/features/fanpage/domain/board-navigation";
import type { WaveProgramKey } from "@/features/fanpage/domain/wave-programs";
import { postPageSchema } from "../domain/content";
import { feedPageSchema } from "../domain/feed";
import { FeedItemCard } from "./feed-item-card";
import { CompactFeed, type PinnedNotice } from "./compact-feed";
import { PointRewardBurst, usePointRewardBurst } from "@/components/fan-ui/point-reward-burst";
import { PostComposer } from "./post-composer";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import {boardCopy} from "@/features/groups/ui/board-copy";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import styles from "@/features/content-safety/ui/content.module.css";
import feedStyles from "./fan-post-feed.module.css";

const parse = (value: unknown) => feedPageSchema.parse(value);
const parseProgram = (value: unknown) => { const page = postPageSchema.parse(value); return { ...page, items: page.items.map(item => ({ ...item, kind: "fan_post" as const })), unavailableSources: [] }; };
type Props = { pinnedNotices?: PinnedNotice[]; pinnedPending?: boolean; filterHref?: (source: BoardFeedSource) => Route; composeIntent?: boolean; composeReturnTo?: string; onComposeConsumed?: () => void; compact?: boolean; beforeFeed?: ReactNode; headingTitle?: string; mediaOnly?: boolean; introduction?: boolean; program?: WaveProgramKey; onPosted?: () => void; slug: string; locale: AppLocale; creatorName?: string; returnTo?: string; source?: BoardFeedSource; newsFilter?: NewsFilter; hideHeading?: boolean; intro?: string; officialPostLabel?: string; allowMembers?: boolean };
export function FanPostFeed(props: Props) {
  const auth = usePrivy(), session = useByUsSession();
  return <FeedForOwner key={`${props.slug}:${props.locale}:${props.program}:${props.source}:${props.newsFilter}:${props.mediaOnly}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`} {...props} />;
}
function FeedForOwner({ pinnedNotices, pinnedPending = false, filterHref, composeIntent = false, composeReturnTo, onComposeConsumed, compact, beforeFeed, headingTitle, introduction = false, slug, locale, program, onPosted, creatorName, returnTo = boardHref(slug, locale, { source: "fans" }), source, newsFilter = "all", hideHeading = false, mediaOnly = false, intro, officialPostLabel, allowMembers = true }: Props) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale), feed = feedCopy(locale), heading = useId();
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [composing, setComposing] = useState(false), [intentDismissed, setIntentDismissed] = useState(false);
  const [lastIntent, setLastIntent] = useState(composeIntent);
  if (lastIntent !== composeIntent) { setLastIntent(composeIntent); if (!composeIntent) setIntentDismissed(false); }
  const [compactLimit, setCompactLimit] = useState(20);
  useEffect(() => {
    if (!compact) return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => { setCompactLimit(media.matches ? 5 : 20); setCursors([null]); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [compact]);
  const composeTrigger = useRef<HTMLButtonElement>(null), section = useRef<HTMLElement>(null);
  const closeComposer = () => { setComposing(false); setIntentDismissed(true); if (composeIntent) onComposeConsumed?.(); requestAnimationFrame(() => composeTrigger.current?.focus()); };
  const insightCopy = program === "live-insight" ? waveEngagementCopy(locale) : null;
  const introductionCopy = wavePrivacyCopy(locale);
  const cursor = cursors.at(-1) ?? null, selectedSource = introduction ? "fans" : source ?? "fans";
  const query = new URLSearchParams({ locale: toContentLocale(locale), source: selectedSource });
  if (compact) query.set("limit", String(compactLimit));
  if (cursor) query.set("cursor", cursor);
  if (mediaOnly) query.set("media", "1");
  if (newsFilter !== "all" && !introduction) query.set("news", newsFilter);
  const resource = useCommunityResource(program ? `/api/celebrities/${slug}/programs/${program}/posts?${query}` : `/api/celebrities/${slug}/feed?${query}`, program ? parseProgram : parse);
  useEffect(() => {
    if (resource.state.status !== "ready" || !window.location.hash.startsWith("#cheer-")) return;
    const id = window.location.hash.slice(1);
    const row = document.getElementById(`cheer-row-${id.slice(6)}`);
    const details = row?.querySelector("details");
    if (details) details.open = true;
    (row ?? document.getElementById(id))?.scrollIntoView?.({ block: "center" });
  }, [resource.state.status]);
  const shownPinned = compact && !cursor && selectedSource !== "fans" ? pinnedNotices ?? [] : [];
  const holding = pinnedPending && compact && !cursor && selectedSource !== "fans";
  const state = holding && resource.state.status === "ready" ? ({ status: "loading" } as const) : resource.state;
  const refresh = () => { setCursors([null]); resource.retry(); };
  const { burst, add: addReward, clear: clearReward } = usePointRewardBurst();
  const saved = (reward?: { points: number }) => { if (reward) addReward(reward.points); refresh(); closeComposer(); onPosted?.(); };
  const goToPage = (next: (string | null)[]) => { setCursors(next); section.current?.focus(); section.current?.scrollIntoView?.({ block: "start" }); };
  const filterLabel = newsFilter === "notice" ? copy.notice : newsFilter === "artist_post" ? officialPostLabel ?? copy.artistPost : "CHZZK";
  const sessionReady = auth.ready && session.ready;
  const composerOpen = composing || (composeIntent && !intentDismissed && sessionReady && auth.authenticated && selectedSource !== "official");
  const loginReturnTo = composeIntent && composeReturnTo ? composeReturnTo : returnTo;
  const writeAction = compact && !composerOpen && selectedSource !== "official" && sessionReady && <div className={feedStyles.writeRow}>{auth.authenticated ? <button ref={composeTrigger} type="button" className={feedStyles.writeButton} onClick={() => setComposing(true)}>{locale === "ko" ? "글쓰기" : copy.writePost}<ArrowRight size={16} aria-hidden="true" /></button> : <Link className={feedStyles.writeButton} href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}`}>{locale === "ko" ? "글쓰기" : copy.writePost}<ArrowRight size={16} aria-hidden="true" /></Link>}</div>;
  return <section id="cheers" ref={section} tabIndex={-1} className={`${styles.section} ${feedStyles.feed} ${compact ? feedStyles.compact : ""}`} aria-labelledby={heading} data-unified-feed="">{burst && <PointRewardBurst locale={locale} points={burst.points} burstKey={burst.key} onDone={clearReward} />}
    {compact && composerOpen && <FanAction variant="text" onClick={closeComposer} leadingIcon={<ArrowLeft/>}>{boardCopy(locale).back}</FanAction>}
    {introduction || program ? <FanSectionHeader id={heading} title={introduction ? waveNavigationCopy(locale).labels[1] : insightCopy?.insightTitle ?? waveProgramsCopy(locale).photos} description={introduction ? introductionCopy.introduction : undefined} /> : <header className={hideHeading && intro === "" ? feedStyles.visuallyHidden : `${feedStyles.heading} ${compact ? feedStyles.compactHeading : ""}`}><h2 id={heading} className={hideHeading ? feedStyles.visuallyHidden : undefined}>{compact && composerOpen ? locale === "ko" ? "글쓰기" : copy.writePost : headingTitle ?? (source ? feed.feed : feed.fanBoard)}</h2>{writeAction}</header>}
    {(!compact || !composerOpen) && beforeFeed}
    {source && !introduction && (!compact || !composerOpen) && <div className={feedStyles.toolbar}><nav className={feedStyles.filters} aria-label={feed.filters}>{(["all", "official", "fans"] as const).map(value => <Link key={value} href={filterHref ? filterHref(value) : boardHref(slug, locale, { source: value, ...(compact&&value === "official" ? {newsFilter:"notice" as const} : {}) })} aria-current={selectedSource === value ? "page" : undefined}>{compact ? value === "official" ? boardCopy(locale).notice : value === "fans" ? boardCopy(locale).free : feed.all : feed[value]}</Link>)}</nav>
      {newsFilter !== "all" && !(compact && newsFilter === "notice") && <span className={feedStyles.topic}>{filterLabel}<Link href={boardHref(slug, locale, { source: "official" })} aria-label={feed.removeFilter}><X size={16} aria-hidden="true" /></Link></span>}
    </div>}
    {selectedSource !== "official" && sessionReady && (auth.authenticated ? (composerOpen ? <PostComposer board={compact} introduction={introduction} program={program} slug={slug} locale={locale} onSaved={saved} onCancel={closeComposer} featured autoFocus allowMembers={allowMembers} /> : compact ? null : <button ref={composeTrigger} type="button" className={styles.composeTrigger} onClick={() => setComposing(true)} aria-label={introduction ? introductionCopy.writeIntroduction : insightCopy?.insightTitle ?? copy.writePost}><span className={styles.composeIcon}><PenLine size={20} aria-hidden="true" /></span><span>{introduction ? introductionCopy.introductionPrompt : insightCopy?.insightPrompt ?? discoveryCopy(locale).writePrompt}</span><strong>{introduction ? introductionCopy.writeIntroduction : insightCopy?.insightTitle ?? copy.writePost}</strong></button>) : compact ? null : <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}`}>{copy.login}</FanAction>)}
    {compact && composerOpen ? null : state.status === "ready" ? <>
      {resource.refreshFailed && <div className={feedStyles.sourceStatus} role="status"><p>{copy.failed}</p><FanAction variant="text" onClick={resource.retry}>{copy.retry}</FanAction></div>}
      {state.data.unavailableSources.length > 0 && <div className={feedStyles.sourceStatus} role="status"><p>{feed.sourceError}</p><FanAction variant="text" onClick={refresh}>{copy.retry}</FanAction></div>}
      {state.data.items.length || shownPinned.length ? <>{compact ? <CompactFeed pinned={shownPinned} items={state.data.items} slug={slug} creatorName={creatorName} locale={locale} returnTo={returnTo} onChanged={resource.retry} officialPostLabel={officialPostLabel} /> : <ul className={styles.list}>{state.data.items.map(item => <li key={`${item.kind}:${item.id}`}><FeedItemCard item={item} slug={slug} creatorName={creatorName} locale={locale} returnTo={returnTo} onChanged={resource.retry} officialPostLabel={officialPostLabel} /></li>)}</ul>}</> : !state.data.nextCursor && !state.data.unavailableSources.length ? <div className={styles.feedEmpty} role="status"><MessageCircle size={28} aria-hidden="true" /><p>{copy.empty}</p></div> : null}
      {compact ? (!state.data.items.length && !shownPinned.length && !state.data.nextCursor && cursors.length<2 ? null : <nav className={feedStyles.pageNumbers} aria-label={source ? feed.feed : feed.fanBoard}>
        <button type="button" aria-label={copy.newer} disabled={!cursor} onClick={() => goToPage(cursors.slice(0, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
        {cursors.map((_, index) => <button key={index} type="button" aria-current={index === cursors.length - 1 ? "page" : undefined} onClick={() => goToPage(cursors.slice(0, index + 1))}>{index + 1}</button>)}
        {state.data.nextCursor && <button type="button" onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}>{cursors.length + 1}</button>}
        <button type="button" aria-label={copy.older} disabled={!state.data.nextCursor} onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}><ChevronRight size={20} aria-hidden="true" /></button>
      </nav>) : (cursor || state.data.nextCursor) && <nav className={`${styles.pagination} ${feedStyles.pagination}`} aria-label={source ? feed.feed : feed.fanBoard}>{cursor && <><button type="button" onClick={() => goToPage([null])}>{copy.newest}</button>{cursors.length > 2 && <button type="button" onClick={() => goToPage(cursors.slice(0, -1))}>{copy.newer}</button>}</>}{state.data.nextCursor && <button type="button" onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}>{copy.older}</button>}</nav>}
    </> : state.status === "loading" && !cursor && auth.ready && (!auth.authenticated || session.ready) ? <div role="status" aria-busy="true" aria-label={copy.loading} className={`${feedStyles.skeleton} ${compact ? feedStyles.skeletonCompact : ""}`}><div aria-hidden="true">{[0, 1, 2].map(row => <div key={row}><i /><span><i /><i /></span></div>)}</div></div> : <div role={state.status === "error" ? "alert" : "status"} className={styles.status}>{state.status === "loading" ? copy.loading : state.code === "FEED_CURSOR_EXPIRED" ? feed.cursorExpired : copy.failed}{state.status === "error" && <button type="button" className={styles.button} onClick={refresh}>{cursor ? feed.refresh : copy.retry}</button>}</div>}
  </section>;
}
