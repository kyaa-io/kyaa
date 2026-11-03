"use client";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { ArrowUpRight, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { discoveryCopy } from "@/i18n/catalogs/features__fan_posts__discovery";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { officialMediaPageSchema } from "../domain/official-media";
import type { ContentAsset } from "@/features/fan-posts/domain/content";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { instagramMediaSchema } from "@/server/instagram/model";
import { liveEventResponseSchema } from "@/features/live/domain/live-event";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";
import { boardHref } from "@/features/fanpage/domain/board-navigation";
import { chzzkFeedSchema, CHZZK_CREATOR_SLUG, CHZZK_CHANNEL_ID } from "@/features/fanpage/domain/chzzk-posts";
import { useNewsSource } from "@/features/fanpage/ui/use-news-source";
import { ParticipationState } from "@/features/schedules/ui/participation-ui";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { feedCopy } from "@/i18n/catalogs/features__fan_posts__feed";
import { messages as newsMessages } from "@/i18n/catalogs/features__fanpage__ui__chzzk-posts";
import { translate } from "@/i18n/messages";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import styles from "@/features/schedules/ui/participation.module.css";
import mediaStyles from "./creator-media-panel.module.css";
import { MediaThumbnail } from "./media-thumbnail";
import { youtubeVideoId } from "../domain/video-thumbnail";

export type CreatorMediaSelection = { id: string; kind: "photos" | "videos" | "replays"; title: string; image: string | null; asset?: ContentAsset | null; href: string; date: string; slug?: string; source?: string; live?: boolean };
type Media = CreatorMediaSelection;
const key = (item: Media) => item.id;
const parseOfficial = (value: unknown) => officialMediaPageSchema.parse(value);
const parseInstagram = (value: unknown) => ({ items: z.object({ items: z.array(instagramMediaSchema) }).parse(value).items.map((item): Media => ({ id: `instagram:${item.id}`, kind: item.mediaType === "VIDEO" ? "videos" : "photos", title: item.caption || `@${item.sourceAccount.username}`, image: item.imageUrl, href: item.permalink, date: item.timestamp })), nextCursor: null });
const parseChzzk = (value: unknown) => { const page = chzzkFeedSchema.parse(value); return { items: page.items.flatMap(item => item.images.map((image, index): Media => ({ id: `chzzk:${item.id}:${index}`, kind: "photos", title: item.text, image: image.url, href: `/community/post/${item.id}`, date: item.date }))), nextCursor: page.nextCursor }; };
const parseReplay = (value: unknown) => ({ items: z.object({ catalog: z.object({ replay: z.array(liveEventResponseSchema) }) }).parse(value).catalog.replay.filter(({ live }) => live.watch.available && live.watch.mode === "replay" && isRecordedReplayUrl(live.watch.provider, live.watch.url)).map(({ live }): Media => ({ id: `replay:${live.id}`, kind: "replays", title: live.title, image: live.heroImage.url, href: live.watch.url, date: live.endsAt ?? live.startsAt, slug: live.celebrity.slug })), nextCursor: null });

const parseLive=(value:unknown)=>({items:z.object({catalog:z.object({liveNow:z.array(liveEventResponseSchema)})}).parse(value).catalog.liveNow.filter(({live})=>live.watch.available).map(({live}):Media=>({id:`live:${live.id}`,kind:'videos',live:true,title:live.title,image:live.heroImage.url,href:live.watch.url,date:live.startsAt,slug:live.celebrity.slug})),nextCursor:null});
const playLabels: Record<AppLocale, string> = { ko: "재생", en: "Play", ja: "再生", "zh-Hans": "播放", "zh-Hant": "播放", es: "Reproducir", id: "Putar", vi: "Phát", th: "เล่น", pt: "Reproduzir", fr: "Lire",
  ru: "Играть"
 };

const closeLabels:Record<AppLocale,string>={ko:'닫기',en:'Close',ja:'閉じる','zh-Hans':'关闭','zh-Hant':'關閉',es:'Cerrar',id:'Tutup',vi:'Đóng',th:'ปิด',pt:'Fechar',fr:'Fermer',ru:'Закрыть'};
export function CreatorMediaPanel({ slug, locale, channelId = slug === CHZZK_CREATOR_SLUG ? CHZZK_CHANNEL_ID : null, socialLinks = [], preview = false, onVideoSelect }: { slug: string; locale: AppLocale; channelId?: string | null; socialLinks?: PublishedCelebrity["socialLinks"]; preview?: boolean; onVideoSelect?:(media:CreatorMediaSelection)=>void }) {
  const compact=useGroupsRelease();
  const c = participationCopy(locale), feed = feedCopy(locale), discovery = discoveryCopy(locale), router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const requestedFilter = search.get("media");
  const filter = !preview && (requestedFilter === "photos" || requestedFilter === "videos" || requestedFilter === "replays") ? requestedFilter : "all";
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const videoFrame = useRef<HTMLIFrameElement>(null),videoDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(!compact){videoFrame.current?.focus();return;}const dialog=videoDialog.current;if(!dialog)return;if(activeVideo){if(!dialog.open){dialog.showModal();dialog.querySelector('button')?.focus();}}else if(dialog.open)dialog.close();},[activeVideo,compact]);
  function setFilter(value: "all" | Media["kind"]) {
    const query = new URLSearchParams(search.toString());
    if (value === "all") query.delete("media"); else query.set("media", value);
    router.replace(`${pathname}?${query.toString()}#celebrity-content` as Route, { scroll: false });
  }
  const auth = usePrivy(), session = useByUsSession();
  const official = useNewsSource(`/api/celebrities/${encodeURIComponent(slug)}/media?locale=${toContentLocale(locale)}`, parseOfficial, key, { key: `${auth.ready}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`, ready: !auth.ready || session.ready, getToken: async () => { if (!auth.ready || !auth.authenticated) return null; const token = await auth.getAccessToken(); if (!token) throw Error(); return token; } });
  const youtube = useNewsSource(socialLinks.some(link => link.platform === "youtube") ? `/api/celebrities/${encodeURIComponent(slug)}/youtube` : null, parseOfficial, key);
  const instagram = useNewsSource(socialLinks.some(link => link.platform === "instagram") ? `/api/celebrities/${encodeURIComponent(slug)}/instagram` : null, parseInstagram, key);
  const chzzk = useNewsSource(channelId ? `/api/celebrities/${encodeURIComponent(slug)}/chzzk` : null, parseChzzk, key);
  const liveNow=useNewsSource(compact&&preview?`/api/live-events?locale=${toContentLocale(locale)}&creator=${encodeURIComponent(slug)}`:null,parseLive,key);
  const replay = useNewsSource(`/api/live-events?locale=${toContentLocale(locale)}`, parseReplay, key);
  const sources = [
    ...(compact&&preview?[{name:"LIVE",resource:liveNow}]:[]),
    ...(filter !== "replays" ? [{ name: "kyaa", resource: official }, ...(socialLinks.some(link => link.platform === "instagram") ? [{ name: "Instagram", resource: instagram }] : [])] : []),
    ...(channelId && (filter === "all" || filter === "photos") ? [{ name: "CHZZK", resource: chzzk }] : []),
    ...(filter === "all" || filter === "replays" ? [{ name: c.replays, resource: replay }] : []),
    ...(socialLinks.some(link => link.platform === "youtube") && (filter === "all" || filter === "videos") ? [{ name: "YouTube", resource: youtube }] : []),
  ];
  const items: Media[] = [...liveNow.state.data.filter(item=>item.live&&item.slug===slug),...official.state.data.map(item => ({ ...item, source: "kyaa" })), ...instagram.state.data.map(item => ({ ...item, source: "Instagram" })), ...youtube.state.data.map(item => ({ ...item, source: "YouTube" })), ...chzzk.state.data.map(item => ({ ...item, source: "CHZZK", href: `https://chzzk.naver.com/${channelId}/community` })), ...replay.state.data.filter(item => item.slug === slug).map(item => ({ ...item, source: c.replays }))]
    .filter(item => filter === "all" || item.kind === filter).sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id));
  const sourceStatus = sources.map(({ name, resource }) => resource.state.status !== "ready" && <div className={mediaStyles.sourceStatus} key={name} role={resource.state.status === "error" ? "alert" : "status"}><span><strong>{name}</strong> · {resource.state.status === "loading" ? c.loading : c.error}</span>{resource.state.status === "error" && <button type="button" onClick={resource.retry}>{c.retry}</button>}</div>);
  const active=items.find(item=>item.id===activeVideo),activeId=active?youtubeVideoId(active.href):null;
  const playerDialog=compact?<dialog ref={videoDialog} className={mediaStyles.videoDialog} aria-label={active?.title??c.videos} onClose={()=>setActiveVideo(null)}><header><strong>{active?.title}</strong><FanAction onClick={()=>videoDialog.current?.close()} leadingIcon={<X/>}>{closeLabels[locale]}</FanAction></header>{activeId&&<iframe ref={videoFrame} className={mediaStyles.player} title={active?.title??c.videos} src={'https://www.youtube.com/embed/'+activeId+'?autoplay=1&playsinline=1&hl='+locale} allow='autoplay; encrypted-media; picture-in-picture; fullscreen' allowFullScreen referrerPolicy='strict-origin-when-cross-origin'/>}</dialog>:null;
  function mediaCard(item: Media,index:number) {
    const internal = item.href.startsWith("/");
    const externalSource = item.source === "YouTube" || item.source === "Instagram" || item.source === "CHZZK";
    const returnTo = preview ? `/${slug}?locale=${locale}` : boardHref(slug, locale, { section: "media", mediaFilter: filter === "all" ? undefined : filter });
    const href = internal ? `${item.href}?${new URLSearchParams({ locale, returnTo })}` : item.href;
    const id = (preview||compact) && item.kind !== "photos" ? youtubeVideoId(item.href) : null;
    const thumbnail = item.asset ? <ContentAssetImage asset={item.asset} locale={locale} alt={item.title} href={href} loading="lazy" anonymousPreview={!auth.ready} /> : <MediaThumbnail key={`${item.image}:${item.href}`} image={item.image} href={item.href} kind={item.kind} source={item.source} locale={locale} />;
    const body = <span className={mediaStyles.cardBody}><strong>{item.title ? externalSource ? <span translate="no">{item.title.slice(0, 120)}</span> : <TranslatedText text={item.title.slice(0, 120)} locale={locale} controls={false} /> : c[item.kind]}</strong>{!compact&&<span className={mediaStyles.meta}>{item.source} · {c[item.kind]}{!internal && <ArrowUpRight size={12} aria-hidden="true" />} · <time dateTime={item.date}>{new Date(item.date).toLocaleDateString(locale)}</time></span>}</span>;
    return <li key={item.id} onClickCapture={onVideoSelect&&item.kind!=="photos"?event=>{event.preventDefault();event.stopPropagation();onVideoSelect(item);}:undefined} data-media-kind={item.kind} data-media-live={item.live||undefined} data-content-asset-card={item.asset ? true : undefined}>
      {item.asset ? <>{thumbnail}<a href={href}>{body}</a></> : id ? <>{!compact&&activeVideo === item.id ? <iframe ref={videoFrame} className={mediaStyles.player} title={`${playLabels[locale]} · ${item.title}`} src={`https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&hl=${locale}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <button type="button" className={mediaStyles.play} onClick={() => setActiveVideo(item.id)} aria-label={`${playLabels[locale]} · ${item.title}`}>{thumbnail}{item.live&&<span className={mediaStyles.liveBadge}>● LIVE</span>}<span className={mediaStyles.playIcon}><Play size={24} fill="currentColor" aria-hidden="true" /></span></button>}<a href={href} target="_blank" rel="noopener noreferrer" data-outbound-kind="external">{body}</a></>
        : item.live ? <><a className={mediaStyles.play} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${playLabels[locale]} · ${item.title}`} data-outbound-kind="external">{thumbnail}<span className={mediaStyles.liveBadge}>● LIVE</span><span className={mediaStyles.playIcon}><Play size={24} aria-hidden="true"/></span></a><a href={href} target="_blank" rel="noopener noreferrer" data-outbound-kind="external">{body}</a></> : <a href={href} target={internal ? undefined : "_blank"} rel={internal ? undefined : "noopener noreferrer"} data-outbound-kind={internal ? undefined : "external"}>{thumbnail}{body}</a>}
      {onVideoSelect&&preview&&index===1&&item.kind!=="photos"&&<FanAction variant="text" className={mediaStyles.videoDetailAction} onClick={()=>onVideoSelect(item)}>{locale==="ko"?"영상·댓글 보기":c.videos}</FanAction>}
    </li>;
  }
  if (preview) {
    if (!items.length && sources.every(source => source.resource.state.status === "ready")) return null;
    // Curated notice videos lead automatic uploads; duplicate recordings remain a single preview.
    const ordered = [...items.filter(item=>item.live), ...items.filter(item=>!item.live).filter(item => item.source === "kyaa"), ...items.filter(item => !item.live&&item.source !== "kyaa")];
    const unique = ordered.filter((item, index) => ordered.findIndex(other => (youtubeVideoId(other.href) || `${other.href}:${other.image ?? other.asset?.id}`) === (youtubeVideoId(item.href) || `${item.href}:${item.image ?? item.asset?.id}`)) === index);
    return <div className={`${mediaStyles.preview} ${compact?mediaStyles.compactPreview:""}`} data-creator-media-preview={slug} data-outbound-campaign={slug} data-outbound-placement="content">
      {sources.some(source => source.resource.state.status !== "ready") && <div>{sourceStatus}</div>}
      {(compact?["videos","photos"] as const:["videos", "photos", "replays"] as const).map(kind => {
        const selected = unique.filter(item => item.kind === kind||(compact&&kind==="videos"&&item.kind==="replays")).slice(0, 3);
        return selected.length > 0 && <section key={kind} data-media-preview-kind={kind} aria-label={c[kind]}><div className={mediaStyles.previewHeading}><FanSectionHeader title={compact&&kind==="videos"?`${c.videos} · LIVE`:c[kind]} action={{ label: compact&&locale==="ko"?"전체 보기":c.more, href: boardHref(slug, locale, { section: "media", mediaFilter: kind }) }} /></div><ul className={`${styles.media} ${mediaStyles.grid} ${mediaStyles.previewGrid}`}>{selected.map(mediaCard)}</ul></section>;
      })}{playerDialog}
    </div>;
  }
  return <section className={mediaStyles.panel} data-creator-media={slug} data-outbound-campaign={slug} data-outbound-placement="content" aria-label={`${c.photos} · ${c.videos}`}>
    <div className={mediaStyles.heading}><FanSectionHeader title={`${c.photos} · ${c.videos}`} description={discovery.mediaIntro} /></div>
    {socialLinks.length > 0 && <nav className={mediaStyles.channels} aria-label={discovery.officialChannels}><span>{discovery.officialChannels}</span>{socialLinks.map(link => <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer" data-outbound-kind="social">{({ youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", chzzk: "CHZZK" })[link.platform]}<ArrowUpRight size={14} aria-hidden="true" /></a>)}</nav>}
    <div className={`${styles.tabs} ${mediaStyles.filters}`}>{(["all", "photos", "videos", "replays"] as const).map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{c[value]}</button>)}</div>
    {sourceStatus}
    {!items.length && sources.every(source => source.resource.state.status === "ready") && <div className={mediaStyles.empty} role="status"><p>{socialLinks.length ? discovery.emptyMedia : c.empty}</p>{filter === "all" ? <FanAction variant="text" href={boardHref(slug, locale)}>{feed.feed}</FanAction> : <FanAction variant="text" onClick={() => setFilter("all")}>{locale === "ko" ? "전체 보기" : translate(locale, newsMessages.m3e5383762d51, "View all")}</FanAction>}</div>}
    <ul className={`${styles.media} ${mediaStyles.grid}`}>{items.map(mediaCard)}</ul>
    {filter !== "replays" && official.state.nextCursor && <FanAction onClick={official.loadMore} disabled={official.state.moreLoading}>kyaa · {official.state.moreLoading ? c.loading : c.more}</FanAction>}
    {filter !== "replays" && official.state.moreError && <ParticipationState locale={locale} status="error" retry={official.loadMore} />}
    {(filter === "all" || filter === "photos") && chzzk.state.nextCursor && <FanAction onClick={chzzk.loadMore} disabled={chzzk.state.moreLoading}>CHZZK · {chzzk.state.moreLoading ? c.loading : c.more}</FanAction>}
    {(filter === "all" || filter === "photos") && chzzk.state.moreError && <ParticipationState locale={locale} status="error" retry={chzzk.loadMore} />}
    {playerDialog}
  </section>;
}
