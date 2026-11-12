"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "../../../components/fan-ui/hover-prefetch-link";
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
import { showMissionRewardToast } from "./mission-reward-toast";
import { PostComposer } from "./post-composer";
import { managementCopy } from "@/features/groups/ui/management-copy";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import {boardCopy} from "@/features/groups/ui/board-copy";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import styles from "@/features/content-safety/ui/content.module.css";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import feedStyles from "./fan-post-feed.module.css";

const parse = (value: unknown) => feedPageSchema.parse(value);
const parseProgram = (value: unknown) => { const page = postPageSchema.parse(value); return { ...page, items: page.items.map(item => ({ ...item, kind: "fan_post" as const })), unavailableSources: [] }; };
type Props = { pageImage?: ReactNode; pinnedNotices?: PinnedNotice[]; pinnedPending?: boolean; filterHref?: (source: BoardFeedSource) => Route; composeIntent?: boolean; composeReturnTo?: string; onComposeConsumed?: () => void; compact?: boolean; beforeFeed?: ReactNode; headingTitle?: string; mediaOnly?: boolean; introduction?: boolean; program?: WaveProgramKey; onPosted?: () => void; slug: string; locale: AppLocale; creatorName?: string; returnTo?: string; source?: BoardFeedSource; newsFilter?: NewsFilter; hideHeading?: boolean; intro?: string; officialPostLabel?: string; allowMembers?: boolean };
export function FanPostFeed(props: Props) {
  const auth = usePrivy(), session = useByUsSession();
  return <FeedForOwner key={`${props.slug}:${props.locale}:${props.program}:${props.source}:${props.newsFilter}:${props.mediaOnly}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`} {...props} />;
}
function FeedForOwner({ pageImage, pinnedNotices, pinnedPending = false, filterHref, composeIntent = false, composeReturnTo, onComposeConsumed, compact, beforeFeed, headingTitle, introduction = false, slug, locale, program, onPosted, creatorName, returnTo = boardHref(slug, locale, { source: "fans" }), source, newsFilter = "all", hideHeading = false, mediaOnly = false, intro, officialPostLabel, allowMembers = true }: Props) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale), feed = feedCopy(locale), heading = useId();
  // [운영] 11/10 19:38: the fan board composer stays open; the creator home 글쓰기 link (`compose=1`) also focuses it. The feed remounts on sign-in.
  const [focusComposer] = useState(() => !compact && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compose") === "1");
  const [composerKey, setComposerKey] = useState(0);
  // kyaa wave introductions and programs keep their opener; the compact (groups) board keeps its own editor.
  const alwaysOpen = !compact && !introduction && !program;
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
  const composeTrigger = useRef<HTMLButtonElement>(null), section = useRef<HTMLElement>(null), toolbar = useRef<HTMLDivElement>(null), [showListAfterSave, setShowListAfterSave] = useState(false);
  const closeComposer = () => { setComposing(false); setIntentDismissed(true); if (composeIntent) onComposeConsumed?.(); requestAnimationFrame(() => composeTrigger.current?.focus()); };
  const insightCopy = program === "live-insight" ? waveEngagementCopy(locale) : null;
  const introductionCopy = wavePrivacyCopy(locale);
  const cursor = cursors.at(-1) ?? null, selectedSource = introduction ? "fans" : source ?? "fans";
  const query = new URLSearchParams({ locale: toContentLocale(locale), source: selectedSource });
  if (compact) query.set("limit", String(compactLimit));
  if (cursor) query.set("cursor", cursor);
  if (mediaOnly) query.set("media", "1");
  if (newsFilter !== "all" && !introduction) query.set("news", newsFilter);
  const resource = useCommunityResource(program ? `/api/celebrities/${slug}/programs/${program}/posts?${query}` : `/api/celebrities/${slug}/feed?${query}`, program ? parseProgram : parse, true, false, false, true);
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
  const saved = (reward?: { points: number; stamps?: number }) => { if (reward) showMissionRewardToast(locale, "post", reward); refresh(); closeComposer(); if (compact) setShowListAfterSave(true); onPosted?.(); };
  // A held page stays on screen while the next one loads; ignore repeat clicks until it arrives.
  const goToPage = (next: (string | null)[]) => { if (resource.pending) return; setCursors(next); section.current?.focus(); section.current?.scrollIntoView?.({ block: "start" }); };
  const filterLabel = newsFilter === "notice" ? copy.notice : newsFilter === "artist_post" ? officialPostLabel ?? copy.artistPost : "CHZZK";
  const sessionReady = auth.ready && session.ready;
  const composerOpen = composing || (composeIntent && !intentDismissed && sessionReady && auth.authenticated && selectedSource !== "official");
  // A saved post lands in the list below "오늘의 인기글", not at the top of the board. Once the form has closed (and the compose link has left the address,
  // whose replace scrolls to the page's hash), bring the list with the new row into view.
  useEffect(() => {
    if (!showListAfterSave || composerOpen || composeIntent) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => { setShowListAfterSave(false); toolbar.current?.scrollIntoView?.({ block: "start" }); }));
    return () => cancelAnimationFrame(frame);
  }, [showListAfterSave, composerOpen, composeIntent]);
  const sourceFilterHref = (value: BoardFeedSource): Route => {
    if (filterHref) return filterHref(value);
    const options: NonNullable<Parameters<typeof boardHref>[2]> = { source: value };
    if (compact && value === "official") options.newsFilter = "notice";
    return boardHref(slug, locale, options);
  };
  const loginReturnTo = composeIntent && composeReturnTo ? composeReturnTo : returnTo;
  const writeAction = compact && !composerOpen && selectedSource !== "official" && sessionReady && <div className={feedStyles.writeRow}><EarnBadgeCorner action="post" locale={locale}>{auth.authenticated ? <button ref={composeTrigger} type="button" className={feedStyles.writeButton} onClick={() => setComposing(true)}>{locale === "ko" ? "글쓰기" : copy.writePost}<ArrowRight size={16} aria-hidden="true" /></button> : <Link className={feedStyles.writeButton} href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}`}>{locale === "ko" ? "글쓰기" : copy.writePost}<ArrowRight size={16} aria-hidden="true" /></Link>}</EarnBadgeCorner></div>;
  return <section id="cheers" ref={section} tabIndex={-1} className={`${styles.section} ${feedStyles.feed} ${compact ? feedStyles.compact : ""}`} aria-labelledby={heading} data-unified-feed="">
    {compact && composerOpen ? null : introduction || program ? <FanSectionHeader id={heading} title={introduction ? waveNavigationCopy(locale).labels[1] : insightCopy?.insightTitle ?? waveProgramsCopy(locale).photos} description={introduction ? introductionCopy.introduction : undefined} /> : <header className={hideHeading && intro === "" ? feedStyles.visuallyHidden : `${feedStyles.heading} ${compact ? feedStyles.compactHeading : ""}`}><h2 id={heading} className={hideHeading ? feedStyles.visuallyHidden : undefined}>{compact && composerOpen ? locale === "ko" ? "글쓰기" : copy.writePost : headingTitle ?? (source ? feed.feed : feed.fanBoard)}</h2>{writeAction}</header>}
    {beforeFeed && <div hidden={compact && composerOpen} className={feedStyles.passThrough}>{beforeFeed}</div>}
    {source && !introduction && (!compact || !composerOpen) && <div ref={toolbar} className={feedStyles.toolbar}><nav className={feedStyles.filters} aria-label={feed.filters}>{(["all", "official", "fans"] as const).map(value => <Link key={value} scroll={false} href={sourceFilterHref(value)} aria-current={selectedSource === value ? "page" : undefined}>{compact ? value === "official" ? boardCopy(locale).notice : value === "fans" ? boardCopy(locale).free : feed.all : feed[value]}</Link>)}</nav>
      {newsFilter !== "all" && !(compact && newsFilter === "notice") && <span className={feedStyles.topic}>{filterLabel}<Link scroll={false} href={boardHref(slug, locale, { source: "official" })} aria-label={feed.removeFilter}><X size={16} aria-hidden="true" /></Link></span>}
    </div>}
    {selectedSource !== "official" && sessionReady && alwaysOpen && (auth.authenticated ? <PostComposer key={composerKey} slug={slug} locale={locale} onSaved={reward => { setComposerKey(value => value + 1); saved(reward); }} onCancel={() => setComposerKey(value => value + 1)} featured autoFocus={focusComposer} allowMembers={allowMembers} />
      : <div className={`${styles.composer} ${styles.composerFeatured}`} data-composer-guest=""><span className={styles.guestPrompt}>{discoveryCopy(locale).writePrompt}</span><div className={styles.composerTools}><FanAction className={styles.guestLogin} variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}`}>{copy.login}</FanAction></div></div>)}
    {selectedSource !== "official" && sessionReady && !alwaysOpen && (auth.authenticated ? (composerOpen ? <PostComposer board={compact} introduction={introduction} program={program} slug={slug} locale={locale} onSaved={saved} onCancel={closeComposer} featured autoFocus allowMembers={allowMembers} heading={compact ? managementCopy(locale).write : undefined} headingId={compact ? heading : undefined} /> : compact ? null : <button ref={composeTrigger} type="button" className={styles.composeTrigger} onClick={() => setComposing(true)} aria-label={introduction ? introductionCopy.writeIntroduction : insightCopy?.insightTitle ?? copy.writePost}><span className={styles.composeIcon}><PenLine size={20} aria-hidden="true" /></span><span>{introduction ? introductionCopy.introductionPrompt : insightCopy?.insightPrompt ?? discoveryCopy(locale).writePrompt}</span><strong>{introduction ? introductionCopy.writeIntroduction : insightCopy?.insightTitle ?? copy.writePost}</strong></button>) : compact ? null : <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(loginReturnTo)}`}>{copy.login}</FanAction>)}
    {compact && composerOpen ? null : state.status === "ready" ? <>
      {resource.refreshFailed && <div className={feedStyles.sourceStatus} role="status"><p>{copy.failed}</p><FanAction variant="text" onClick={resource.retry}>{copy.retry}</FanAction></div>}
      {state.data.unavailableSources.length > 0 && <div className={feedStyles.sourceStatus} role="status"><p>{feed.sourceError}</p><FanAction variant="text" onClick={refresh}>{copy.retry}</FanAction></div>}
      {state.data.items.length || shownPinned.length ? <>{compact ? <CompactFeed pageImage={pageImage} pinned={shownPinned} items={state.data.items} slug={slug} creatorName={creatorName} locale={locale} returnTo={returnTo} onChanged={resource.retry} officialPostLabel={officialPostLabel} /> : <FanSurface as="div" appearance="list"><ul className={styles.list}>{state.data.items.map(item => <li key={`${item.kind}:${item.id}`}><FeedItemCard item={item} slug={slug} creatorName={creatorName} locale={locale} returnTo={returnTo} onChanged={resource.retry} officialPostLabel={officialPostLabel} /></li>)}</ul></FanSurface>}</> : !state.data.nextCursor && !state.data.unavailableSources.length ? <div className={styles.feedEmpty} role="status"><MessageCircle size={28} aria-hidden="true" /><p>{copy.empty}</p></div> : null}
      {compact ? (!state.data.items.length && !shownPinned.length && !state.data.nextCursor && cursors.length<2 ? null : <nav className={feedStyles.pageNumbers} aria-label={source ? feed.feed : feed.fanBoard}>
        <button type="button" aria-label={copy.newer} disabled={!cursor} onClick={() => goToPage(cursors.slice(0, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
        {cursors.map((_, index) => <button key={index} type="button" aria-current={index === cursors.length - 1 ? "page" : undefined} onClick={() => goToPage(cursors.slice(0, index + 1))}>{index + 1}</button>)}
        {state.data.nextCursor && <button type="button" onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}>{cursors.length + 1}</button>}
        <button type="button" aria-label={copy.older} disabled={!state.data.nextCursor} onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}><ChevronRight size={20} aria-hidden="true" /></button>
      </nav>) : (cursor || state.data.nextCursor) && <nav className={`${styles.pagination} ${feedStyles.pagination}`} aria-label={source ? feed.feed : feed.fanBoard}>{cursor && <><button type="button" onClick={() => goToPage([null])}>{copy.newest}</button>{cursors.length > 2 && <button type="button" onClick={() => goToPage(cursors.slice(0, -1))}>{copy.newer}</button>}</>}{state.data.nextCursor && <button type="button" onClick={() => goToPage([...cursors, state.status === "ready" ? state.data.nextCursor : null])}>{copy.older}</button>}</nav>}
    </> : state.status === "loading" && !cursor && auth.ready && (!auth.authenticated || session.ready) ? <div role="status" aria-busy="true" aria-label={copy.loading} className={`${feedStyles.skeleton} ${compact ? feedStyles.skeletonCompact : ""}`}><div aria-hidden="true">{[0, 1, 2].map(row => <div key={row}><i /><span><i /><i /></span></div>)}</div></div> : <div role={state.status === "error" ? "alert" : "status"} className={styles.status}>{state.status === "loading" ? copy.loading : state.code === "FEED_CURSOR_EXPIRED" ? feed.cursorExpired : copy.failed}{state.status === "error" && <button type="button" className={styles.button} onClick={refresh}>{cursor ? feed.refresh : copy.retry}</button>}</div>}
  </section>;
}
