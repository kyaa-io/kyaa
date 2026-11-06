"use client";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { WalletAttendanceDialog } from "@/features/group-wallet/ui/wallet-screen";
import { CreatorAttendanceEntry } from "@/features/dukjil/ui/creator-attendance-entry";
import { LinkedFanpageContent } from "./linked-fanpage-content";
import { GroupCalendarPanel } from "./group-calendar";
import { useRef, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { GroupMembers } from "./group-members";
import { GroupActivitiesPanel, GroupEventsList, GroupCollections } from "./group-activities";
import { GroupBoard, type BoardLocation } from "./group-board";
import { GroupManagement } from "./group-management";
import { groupsCopy } from "./copy";
import { GroupHomeInfo,GroupBrandHomeEvent,GroupHomeGallery } from "./group-home-panels";
import { brandJoin,fanStories } from "./home-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./groups.module.css";
import { activityCardCopy } from "./activity-card-copy";
import homeStyles from "./creator-group-home.module.css";
import { GroupPageFrame } from "./group-page-frame";
import { useGroupPage, useOptionalGroupPage } from "./group-page-context";
import { GroupRoomsPanel } from "./group-rooms-panel";
import { useRetiredInfoTab } from "./use-retired-info-tab";

export { GroupRoomsPanel } from "./group-rooms-panel";

type GroupDetailScreenProps = {locale:AppLocale;pageId:string;tab?:string;calendarMonth?:string;initialPostId?:string;initialRoomId?:string;boardSource?:'all'|'official'|'fans';initialBoardState?:BoardLocation;initialReturnTo?:string;boardHeading?:string};

/** 탭 본문. 머리·접속 띠·탭과 가입 상태는 GroupPageFrame이 소유한다. 라우트 밖에서 쓰이면 스스로 프레임을 두른다. */
export function GroupDetailScreen(props:GroupDetailScreenProps) {
  const frame=useOptionalGroupPage();
  if(frame)return <GroupDetailBody {...props}/>;
  return <GroupPageFrame pageId={props.pageId} locale={props.locale} initialTab={props.tab??'home'}><GroupDetailBody {...props}/></GroupPageFrame>;
}

function GroupDetailBody({locale,pageId,calendarMonth,initialPostId,initialRoomId,boardSource='all',initialBoardState,boardHeading}:GroupDetailScreenProps) {
  const t=groupsCopy(locale),g=useGroupPage(),tab=g.activeTab==='info'?'home':g.activeTab,{page,detail,celebrity:creator}=g;
  useRetiredInfoTab();
  const [attendanceOpen,setAttendanceOpen]=useState(false);
  const attendanceTrigger=useRef<HTMLAnchorElement|null>(null);
  const href=(value:string)=>g.hrefFor(value);
  if(!page||!detail||(page.kind==='fan'&&!creator))return <FanSkeletonRows rows={5} variant="post"/>;
  const joinLabel=page.kind==='brand'?brandJoin[locale]:t.join,pending=g.joinPending,startJoin=g.startJoin;
  return <>
    {creator&&(tab==='home'||tab==='board'&&!initialPostId)?<LinkedFanpageContent celebrity={creator} locale={locale} view={tab==='home'?'home':'board'} returnTo={tab==='board'&&boardSource!=='all'?`${href('board')}&source=${boardSource}`:href('board')} pageId={pageId} source={tab==='board'?boardSource:'all'}/>:tab==='calendar'?<GroupCalendarPanel page={page} locale={locale} month={calendarMonth} calendarPath={href('calendar')}/>:<div className={`${styles.layout} ${homeStyles.noTopGap}`}><div className={styles.main}>
      {tab==='manage'&&detail.membership&&detail.membership.role!=='member'&&<GroupManagement key={`${g.ownerKey}:${detail.membership.role}`} detail={detail} locale={locale} refresh={g.refresh}/>}
      {tab==='home'&&<div className={homeStyles.main}>
        {page.kind==='brand'&&<GroupBrandHomeEvent pageId={pageId} locale={locale}/>}
        <GroupHomeGallery pageId={pageId} locale={locale}/>
        <GroupBoard key={g.ownerKey} detail={detail} locale={locale} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} preview heading={boardHeading??fanStories[locale]}/>
        <div className={styles.mobileParticipation}><section className={styles.sourceHomeCard}><h2>{activityCardCopy[locale].title}</h2><p>{activityCardCopy[locale].body}</p><FanAction href={`/pages/groups/${pageId}/missions?locale=${locale}`}>{activityCardCopy[locale].check}</FanAction><FanAction variant='text' href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;event.currentTarget.focus();setAttendanceOpen(true);}}>{activityCardCopy[locale].attendance}</FanAction></section></div>
        <div className={homeStyles.mobileOnly}><FanAction className={styles.hobbyBenefits} href={`/benefits?locale=${locale}`} trailingIcon={<ArrowRight/>}>{locale==='ko'?'덕질에서 혜택·응원':'Benefits and support'}</FanAction><FanAction className={styles.hobbyPassport} href={`/my?locale=${locale}`} leadingIcon={<BookOpen/>} trailingIcon={<ArrowRight/>}>{walletCopy(locale).passport}</FanAction></div>
      </div>}
      {(tab==='board'||tab==='news')&&<GroupBoard key={g.ownerKey} detail={detail} locale={locale} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} initialPostId={initialPostId} initialBoardState={initialBoardState} listHref={creator&&tab==='board'?`/pages/groups/${pageId}?locale=${locale}&tab=board${boardSource==='all'?'':`&source=${boardSource}`}`:undefined}/>}
      {tab==='members'&&<GroupMembers key={`${g.ownerKey}:${pageId}`} pageId={pageId} rankingsSlug={page.slug} locale={locale} member={Boolean(detail.membership)} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} inTab presentation={{creatorName:page.name,subtitles:{},}}/>}
      {tab==='rooms'&&<GroupRoomsPanel key={`${g.ownerKey}:${initialRoomId??''}:${detail.membership?'member':'guest'}`} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} pageId={pageId} locale={locale} slug={page.slug} imageUrl={page.imageUrl} initialRoomId={initialRoomId}/>}
      {tab==='activities'&&<GroupActivitiesPanel pageId={pageId} locale={locale} pageName={page.name}/>}
      {tab==='events'&&<GroupEventsList pageId={pageId} locale={locale}/>}
      {tab==='collection'&&<GroupCollections key={`${g.ownerKey}:${pageId}`} pageId={pageId} locale={locale} pageName={page.name}/>}
    </div>{creator?<LinkedFanpageContent celebrity={creator} locale={locale} view="aside" returnTo={href(tab)}/>:<GroupHomeInfo page={page} locale={locale}/>}</div>}
  {attendanceOpen&&(page.slug&&page.celebrityId?<CreatorAttendanceEntry slug={page.slug} pageName={page.name} locale={locale} reviewHref={`/${page.slug}?locale=${locale}&tab=certifications`} onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>:<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>)}
  </>;
}
