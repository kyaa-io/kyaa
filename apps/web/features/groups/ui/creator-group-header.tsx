"use client";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import Link from "next/link";
import type { Route } from "next";
import { UsersRound } from "lucide-react";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { AppLocale } from "@/i18n/locales";
import { creatorIdentity } from "@/features/fanpage/domain/creator-identities";
import type { ReactNode } from "react";
import { GroupActivitiesPanel, GroupCollections,GroupEventsList } from "./group-activities";
import {GroupBookmarkAction} from './group-bookmark-action';
import { GroupPageMenu } from "./group-page-menu";
import { GroupPresence } from "./group-presence";
import { GroupRoomsPanel } from "./group-detail";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupDetailSchema } from "../domain/contracts";
import { useGroupResource } from "./use-group-resource";
import { groupsCopy } from "./copy";
import { CreatorBrandNewsPreview } from "./creator-group-home";
import { membersAndRank } from "./home-copy";
import { GroupBrandHomeEvent } from "./group-home-panels";
import styles from "./groups.module.css";
const parse=(value:unknown)=>groupDetailSchema.parse(value);
export function CreatorGroupHeader({celebrity,locale,tab}:{celebrity:PublishedCelebrity;locale:AppLocale;tab:string}) {
 const identity=creatorIdentity(celebrity.slug),compact=tab==='rooms'||tab==='activities';
 const t=groupsCopy(locale),resource=useGroupResource(`/api/groups/resolve/${encodeURIComponent(celebrity.slug)}`,parse),page=resource.data?.page;
 const brand=celebrity.roles.includes('brand'),tabs=brand?['home','news','events','collection'] as const:['home','board','rooms','activities'] as const;
 const active=tab==='certifications'||tab==='events'&&!brand?'activities':tab==='board'&&brand?'news':tab;
 const href=(next:string)=>`/${celebrity.slug}?locale=${locale}&tab=${next}#celebrity-content` as Route;
 return <><header className={`${styles.identity} ${styles.creatorIdentityHeader}`} data-compact={compact||undefined}>
   <img className={styles.avatar} src={celebrity.image.url} width={64} height={64} alt=""/>
   <div className={styles.identityCopy}><div className={styles.creatorTitleRow}><h1>{celebrity.name}</h1>{resource.data&&<GroupBookmarkAction key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} iconOnly/>}</div><p className={`${styles.meta} ${styles.creatorMemberMeta}`}>{identity?.fandom?`${locale==='ko'?identity.fandom.ko:identity.fandom.name} · `:''}{brand?t.brand:t.fan}{page?` ${page.memberCount.toLocaleString(locale)}`:''}</p><p className={`${styles.meta} ${styles.creatorDescription}`}>{identity?.fandom?`${locale==='ko'?identity.fandom.ko:identity.fandom.name} · `:''}<TranslatedText text={celebrity.summary} locale={locale} controls={false}/></p></div>
   <div className={styles.creatorIdentityActions}>{celebrity.socialLinks.length>0&&<nav className={`${styles.socials} ${styles.creatorSocials}`} aria-label={celebrity.name}>{celebrity.socialLinks.map(social=><a key={social.platform} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform} data-platform={social.platform} data-outbound-kind="social"><img src={social.platform==="chzzk"?"/images/guest-home/chzzk.png":`/images/guest-home/${social.platform}.svg`} width={20} height={20} alt=""/></a>)}</nav>}{page&&<FanAction className={resource.data?.membership?styles.creatorJoined:styles.creatorJoin} href={`/pages/groups/${page.id}?locale=${locale}&returnTo=${encodeURIComponent(`/${celebrity.slug}?locale=${locale}&tab=${tab}`)}`}>{resource.data?.membership?t.joined:t.join}</FanAction>}</div>
 </header>{page&&<GroupPresence pageId={page.id} locale={locale} member={Boolean(resource.data?.membership)} mode={compact?"hidden":"compact"}/>}<div className={styles.pageNavigation}><div className={styles.pageUtilities}>{page&&<Link className={styles.chip} href={`/pages/groups/${page.id}?locale=${locale}&tab=members` as Route}><UsersRound size={18}/>{membersAndRank[locale]}</Link>}{resource.data&&<GroupPageMenu key={resource.ownerKey} detail={resource.data} locale={locale} refresh={resource.retry} socialLinks={celebrity.socialLinks}/>}</div><nav id="celebrity-content" className={styles.tabs} aria-label={celebrity.name}>{tabs.map(value=><Link className={styles.tab} key={value} href={href(value)} aria-current={active===value?'page':undefined}>{t[value]}</Link>)}</nav></div></>;

}
export function CreatorGroupActivities({slug,locale}:{slug:string;locale:AppLocale}) {
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return r.data?<GroupActivitiesPanel pageId={r.data.page.id} locale={locale}/>:<p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>;
}
export function CreatorGroupRooms({slug,locale}:{slug:string;locale:AppLocale}) {
 const t=groupsCopy(locale),resource=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return resource.data?<GroupRoomsPanel pageId={resource.data.page.id} locale={locale} slug={slug}/>:<section className={styles.panel}><h2>{t.rooms}</h2><p role={resource.error?'alert':'status'}>{resource.error?t.error:t.loading}</p></section>;
}

export function CreatorGroupCollection({slug,locale}:{slug:string;locale:AppLocale}) {
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);
 return r.data?<GroupCollections pageId={r.data.page.id} locale={locale}/>:<p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>;
}

export function CreatorGroupEvents({slug,locale}:{slug:string;locale:AppLocale}){
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);return r.data?<GroupEventsList pageId={r.data.page.id} locale={locale}/>:<p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>;
}
export function CreatorGroupBrandHome({slug,locale}:{slug:string;locale:AppLocale;news:ReactNode}){
 const t=groupsCopy(locale),r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parse);return r.data?<div className={`${styles.layout} ${styles.brandHomeLayout}`}><GroupBrandHomeEvent pageId={r.data.page.id} locale={locale}/><aside className={styles.brandNews}><CreatorBrandNewsPreview slug={slug} locale={locale}/></aside></div>:<p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>;
}
