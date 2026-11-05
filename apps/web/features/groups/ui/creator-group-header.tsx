"use client";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import type { Route } from "next";
import {GroupMembers} from "./group-members";
import {FanRouteLoading} from "@/components/fan-ui/fan-route-loading";
import {GroupIdentityHeader} from "./group-shell";
import {CreatorFanGrade} from "./creator-fan-grade";
import { Star } from "lucide-react";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { AppLocale } from "@/i18n/locales";
import { creatorIdentity } from "@/features/fanpage/domain/creator-identities";
import {GroupTabLinks} from "./group-tab-links";
import type { ReactNode } from "react";
import { GroupActivitiesPanel, GroupCollections,GroupEventsList } from "./group-activities";
import {GroupBookmarkAction} from './group-bookmark-action';
import {interactionCopy} from './interaction-copy';
import { GroupPageMenu,useCompactHeader } from "./group-page-menu";
import { GroupPresence } from "./group-presence";
import { GroupRoomsPanel } from "./group-detail";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { groupDetailSchema } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { CreatorBrandNewsPreview } from "./creator-group-home";
import { GroupBrandHomeEvent } from "./group-home-panels";
import styles from "./groups.module.css";
const parse=(value:unknown)=>groupDetailSchema.parse(value);
export function CreatorGroupHeader({celebrity,locale,tab,membershipAction,navigationHref,groupResource}:{celebrity:PublishedCelebrity;locale:AppLocale;tab:string;membershipAction?:ReactNode;navigationHref?:(tab:string)=>string;groupResource?:{data:ReturnType<typeof parse>|undefined;ownerKey:string;retry:()=>void}}) {
 const compact=useCompactHeader(),identity=creatorIdentity(celebrity.slug),query=useSearchParams();
 const t=groupsCopy(locale),loaded=useGroupResource(groupResource?null:`/api/groups/resolve/${encodeURIComponent(celebrity.slug)}`,parse),resource=groupResource??loaded,page=resource.data?.page;
 const brand=celebrity.roles.includes('brand');
 const active=tab==='certifications'||tab==='events'&&!brand?'activities':tab;
 const href=(next:string)=>{if(navigationHref)return navigationHref(next) as Route;const params=new URLSearchParams({locale,tab:next});const keys=['returnTo',...(next==='rooms'?['room']:next==='calendar'?['month']:next==='board'?['section','source','news','media']:[])];for(const key of keys){const value=query?.get(key);if(value)params.set(key,value);}return `/${celebrity.slug}?${params}` as Route;};
 return <>{brand?<GroupIdentityHeader name={celebrity.name} imageUrl={celebrity.image.url} locale={locale} meta={`${t.brand}${page?` · ${t.members} ${page.memberCount.toLocaleString(locale)}`:''}`} description={<TranslatedText text={celebrity.summary} locale={locale} controls={false}/>} titleAction={<>{resource.data&&<GroupBookmarkAction key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} iconOnly/>}{compact&&resource.data&&<GroupPageMenu key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} socialLinks={celebrity.socialLinks}/>}</>} actions={<>{celebrity.socialLinks.length>0&&<nav className={styles.socials} aria-label={celebrity.name}>{celebrity.socialLinks.map(social=><a key={social.platform} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform} data-outbound-kind="social"><img src={social.platform==="chzzk"?"/images/guest-home/chzzk.png":`/images/guest-home/${social.platform}.svg`} width={20} height={20} alt=""/></a>)}</nav>}{membershipAction??(page&&<FanAction href={`/pages/groups/${page.id}?locale=${locale}&returnTo=${encodeURIComponent(`/${celebrity.slug}?locale=${locale}&tab=${tab}`)}`}>{resource.data?.membership?t.joined:t.join}</FanAction>)}</>}/>:<header className={`${styles.identity} ${styles.creatorIdentityHeader}`}>
   <img className={styles.avatar} src={celebrity.image.url} width={64} height={64} alt=""/>
   <div className={styles.identityCopy}><div className={styles.creatorTitleRow}><h1>{celebrity.name}</h1>{brand?resource.data&&<GroupBookmarkAction key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} iconOnly/>:<Link className={fanActionClassName('text',{className:styles.bookmarkIcon})} href={`/c/${celebrity.slug}/verify?locale=${locale}` as Route} aria-label={interactionCopy(locale).verify}><Star size={22} aria-hidden='true'/></Link>}{compact&&resource.data&&<GroupPageMenu key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} socialLinks={celebrity.socialLinks}/>}</div><p className={`${styles.meta} ${styles.creatorMemberMeta}`}>{identity?.fandom?`${locale==='ko'?identity.fandom.ko:identity.fandom.name} · `:''}{brand?t.brand:t.fan}{page?` ${page.memberCount.toLocaleString(locale)}`:''}</p><p className={`${styles.meta} ${styles.creatorDescription}`}>{identity?.fandom&&<span className={styles.creatorFandomPrefix}>{`${locale==='ko'?identity.fandom.ko:identity.fandom.name} · `}</span>}<TranslatedText text={celebrity.summary} locale={locale} controls={false}/></p></div>
   <div className={styles.creatorIdentityActions}><div className={styles.creatorUtilities}>{!brand&&<CreatorFanGrade slug={celebrity.slug} locale={locale}/>}{celebrity.socialLinks.length>0&&<nav className={`${styles.socials} ${styles.creatorSocials}`} aria-label={celebrity.name}>{celebrity.socialLinks.map(social=><a key={social.platform} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform} data-platform={social.platform} data-outbound-kind="social"><img src={social.platform==="chzzk"?"/images/guest-home/chzzk.png":`/images/guest-home/${social.platform}.svg`} width={20} height={20} alt=""/></a>)}</nav>}</div>{membershipAction??(page&&<FanAction className={resource.data?.membership?styles.creatorJoined:styles.creatorJoin} href={`/pages/groups/${page.id}?locale=${locale}&returnTo=${encodeURIComponent(`/${celebrity.slug}?locale=${locale}&tab=${tab}`)}`}>{resource.data?.membership?t.joined:t.join}</FanAction>)}</div>
 </header>}{page&&<GroupPresence pageId={page.id} locale={locale} member={Boolean(resource.data?.membership)} mode="compact"/>}<div className={styles.pageNavigation} data-kind={brand?'brand':'fan'}><GroupTabLinks id="celebrity-content" label={celebrity.name} locale={locale} current={`${active}:${tab}:${Boolean(page)}`} active={tab==='members'?'members':active} href={next=>next==='members'?(navigationHref?.(next)??href(next)):href(next)} members={Boolean(page)} scroll={false}/>{!compact&&<div className={styles.pageUtilities}>{resource.data&&<GroupPageMenu key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} socialLinks={celebrity.socialLinks}/>}</div>}</div></>;

}
export function CreatorGroupActivities({slug,locale}:{slug:string;locale:AppLocale}) {
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return r.data?<GroupActivitiesPanel pageId={r.data.page.id} locale={locale} pageName={r.data.page.name}/>:r.error?<p role='alert'>{t.error}</p>:<FanRouteLoading locale={locale} presentation='overlay'/>;
}
export function CreatorGroupRooms({slug,locale,initialRoomId}:{slug:string;locale:AppLocale;initialRoomId?:string}) {
 const t=groupsCopy(locale),resource=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return resource.data?<GroupRoomsPanel key={`${resource.ownerKey}:${initialRoomId??""}`} initialRoomId={initialRoomId} pageId={resource.data.page.id} locale={locale} slug={slug} imageUrl={resource.data.page.imageUrl}/>:<section className={styles.panel}><h2>{t.rooms}</h2>{resource.error?<p role='alert'>{t.error}</p>:<FanRouteLoading locale={locale} presentation='overlay'/>}</section>;
}

export function CreatorGroupCollection({slug,locale}:{slug:string;locale:AppLocale}) {
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return r.data?<GroupCollections key={`${r.ownerKey}:${r.data.page.id}`} pageId={r.data.page.id} locale={locale} pageName={r.data.page.name}/>:r.error?<p role='alert'>{t.error}</p>:<FanRouteLoading locale={locale} presentation='overlay'/>;
}

export function CreatorGroupEvents({slug,locale}:{slug:string;locale:AppLocale}){
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);return r.data?<GroupEventsList pageId={r.data.page.id} locale={locale}/>:r.error?<p role='alert'>{t.error}</p>:<FanRouteLoading locale={locale} presentation='overlay'/>;
}
export function CreatorGroupBrandHome({slug,locale}:{slug:string;locale:AppLocale;news:ReactNode}){
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);return r.data?<div className={styles.layout}><GroupBrandHomeEvent pageId={r.data.page.id} locale={locale}/><aside className={styles.brandNews}><CreatorBrandNewsPreview slug={slug} locale={locale}/></aside></div>:r.error?<p role='alert'>{t.error}</p>:<FanRouteLoading locale={locale} presentation='overlay'/>;
}

export function CreatorGroupMembers({celebrity,locale}:{celebrity:PublishedCelebrity;locale:AppLocale}) {
 const resource=useGroupResource(`/api/groups/resolve/${encodeURIComponent(celebrity.slug)}`,parse),t=groupsCopy(locale),page=resource.data?.page;
 const linked=page&&page.slug===celebrity.slug&&page.celebrityId&&page.kind===(celebrity.roles.includes('brand')?'brand':'fan');
 if(resource.error||page&&!linked)return <div role="alert"><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>;
 return linked?<GroupMembers key={resource.ownerKey} pageId={page.id} locale={locale} member={Boolean(resource.data?.membership)} inTab/>:<FanRouteLoading locale={locale} presentation='overlay'/>;
}
