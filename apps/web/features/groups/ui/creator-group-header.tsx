"use client";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { AppLocale } from "@/i18n/locales";
import type { ReactNode } from "react";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { GroupMembers } from "./group-members";
import { GroupActivitiesPanel, GroupCollections, GroupEventsList } from "./group-activities";
import { GroupRoomsPanel } from "./group-rooms-panel";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupsCopy } from "./copy";
import { CreatorBrandNewsPreview } from "./creator-group-home";
import { GroupBrandHomeEvent } from "./group-home-panels";
import { GroupPageHead, GroupPageJoin } from "./group-page-frame";
import { GroupPageProvider, useGroupPage, useOptionalGroupPage } from "./group-page-context";
import styles from "./groups.module.css";

/** 프레임 밖 화면(게시글 상세, 미션 결과 등)의 머리. 같은 FanPageHeader를 그리되 그 화면 안에서 스스로 읽는다. */
export function CreatorGroupHeader({celebrity,locale,tab,pageId}:{celebrity:PublishedCelebrity;locale:AppLocale;tab:string;pageId?:string}) {
 const framed=useOptionalGroupPage();
 if(framed)return <GroupPageHead/>;
 return <GroupPageProvider slug={pageId?undefined:celebrity.slug} pageId={pageId} celebrity={celebrity} locale={locale} initialTab={tab}><GroupPageHead/><GroupPageJoin/></GroupPageProvider>;
}

function BodyState({t,error,retry}:{t:ReturnType<typeof groupsCopy>;error:boolean;retry:()=>void}){
 return error?<div role="alert"><p>{t.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>:<FanSkeletonRows rows={5} variant="plain"/>;
}
export function CreatorGroupActivities({locale}:{slug?:string;locale:AppLocale}) {
 const g=useGroupPage(),t=groupsCopy(locale);
 return g.page?<GroupActivitiesPanel pageId={g.page.id} locale={locale} pageName={g.page.name}/>:<BodyState t={t} error={g.error} retry={g.refresh}/>;
}
export function CreatorGroupRooms({slug,locale,initialRoomId}:{slug:string;locale:AppLocale;initialRoomId?:string}) {
 const g=useGroupPage(),t=groupsCopy(locale);
 return g.page?<GroupRoomsPanel key={`${g.ownerKey}:${initialRoomId??""}`} initialRoomId={initialRoomId} pageId={g.page.id} locale={locale} slug={slug} imageUrl={g.page.imageUrl} onJoin={g.startJoin} joinPending={g.joinPending}/>:<section className={styles.panel}><h2>{t.rooms}</h2><BodyState t={t} error={g.error} retry={g.refresh}/></section>;
}
export function CreatorGroupCollection({locale}:{slug?:string;locale:AppLocale}) {
 const g=useGroupPage(),t=groupsCopy(locale);
 return g.page?<GroupCollections key={`${g.ownerKey}:${g.page.id}`} pageId={g.page.id} locale={locale} pageName={g.page.name}/>:<BodyState t={t} error={g.error} retry={g.refresh}/>;
}
export function CreatorGroupEvents({locale}:{slug?:string;locale:AppLocale}){
 const g=useGroupPage(),t=groupsCopy(locale);
 return g.page?<GroupEventsList pageId={g.page.id} locale={locale}/>:<BodyState t={t} error={g.error} retry={g.refresh}/>;
}
export function CreatorGroupBrandHome({slug,locale}:{slug:string;locale:AppLocale;news:ReactNode}){
 const g=useGroupPage(),t=groupsCopy(locale);
 return g.page?<div className={styles.layout}><GroupBrandHomeEvent pageId={g.page.id} locale={locale}/><aside className={styles.brandNews}><CreatorBrandNewsPreview slug={slug} locale={locale}/></aside></div>:<BodyState t={t} error={g.error} retry={g.refresh}/>;
}
export function CreatorGroupMembers({celebrity,locale}:{celebrity:PublishedCelebrity;locale:AppLocale}) {
 const g=useGroupPage(),t=groupsCopy(locale),page=g.page;
 const linked=page&&page.slug===celebrity.slug&&page.celebrityId&&page.kind===(celebrity.roles.includes('brand')?'brand':'fan');
 if(g.error||page&&!linked)return <div role="alert"><p>{t.error}</p><FanAction onClick={g.refresh}>{t.retry}</FanAction></div>;
 return linked?<GroupMembers key={g.ownerKey} pageId={page.id} rankingsSlug={celebrity.slug} locale={locale} member={Boolean(g.membership)} onJoin={g.startJoin} joinPending={g.joinPending} joinLabel={g.joinLabel} inTab presentation={{creatorName:celebrity.name,subtitles:{}}}/>:<FanSkeletonRows rows={5} variant="member"/>;
}
