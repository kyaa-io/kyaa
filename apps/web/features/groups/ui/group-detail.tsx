"use client";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { LinkedFanpageContent } from "./linked-fanpage-content";
import { GroupCalendarPanel } from "./group-calendar";
import type { AppLocale } from "@/i18n/locales";
import { GroupMembers } from "./group-members";
import { GroupActivitiesPanel, GroupEventsList, GroupCollections } from "./group-activities";
import { GroupBoard, type BoardLocation } from "./group-board";
import { GroupManagement } from "./group-management";
import { groupsCopy } from "./copy";
import { GroupHome,GroupSideRail } from "./group-home";
import { brandJoin } from "./home-copy";
import styles from "./groups.module.css";
import homeStyles from "./creator-group-home.module.css";
import { GroupPageFrame } from "./group-page-frame";
import { useGroupPage, useOptionalGroupPage } from "./group-page-context";
import { GroupRoomsPanel } from "./group-rooms-panel";
import { GROUP_COLLECTIONS_VISIBLE } from "../domain/collection-visibility";
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
  const t=groupsCopy(locale),g=useGroupPage(),tab=g.activeTab==='info'||g.activeTab==='collection'&&!GROUP_COLLECTIONS_VISIBLE?'home':g.activeTab,{page,detail,celebrity:creator}=g;
  useRetiredInfoTab();
  const href=(value:string)=>g.hrefFor(value);
  if(!page||!detail||(page.kind==='fan'&&!creator))return <FanSkeletonRows rows={5} variant="post"/>;
  const joinLabel=page.kind==='fan'?g.joinLabel:page.kind==='brand'?brandJoin[locale]:t.join,pending=g.joinPending,startJoin=g.startJoin;
  return <>
    {creator&&(tab==='home'||tab==='board'&&!initialPostId)?<LinkedFanpageContent celebrity={creator} locale={locale} view={tab==='home'?'home':'board'} returnTo={tab==='board'&&boardSource!=='all'?`${href('board')}&source=${boardSource}`:href('board')} pageId={pageId} source={tab==='board'?boardSource:'all'}/>:tab==='home'?<GroupHome locale={locale} pageId={pageId} heading={boardHeading}/>:tab==='calendar'?<GroupCalendarPanel page={page} locale={locale} month={calendarMonth} calendarPath={href('calendar')}/>:<div className={`${styles.layout} ${homeStyles.noTopGap}`}><div className={styles.main}>
      {tab==='manage'&&detail.membership&&detail.membership.role!=='member'&&<GroupManagement key={`${g.ownerKey}:${detail.membership.role}`} detail={detail} locale={locale} refresh={g.refresh}/>}
      {(tab==='board'||tab==='news')&&<GroupBoard key={g.ownerKey} detail={detail} locale={locale} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} initialPostId={initialPostId} initialBoardState={initialBoardState} listHref={creator&&tab==='board'?`/pages/groups/${pageId}?locale=${locale}&tab=board${boardSource==='all'?'':`&source=${boardSource}`}`:undefined}/>}
      {tab==='members'&&<GroupMembers key={`${g.ownerKey}:${pageId}`} pageId={pageId} rankingsSlug={page.slug} locale={locale} member={Boolean(detail.membership)} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} inTab presentation={{creatorName:page.name,subtitles:{},}}/>}
      {tab==='rooms'&&<GroupRoomsPanel key={`${g.ownerKey}:${initialRoomId??''}:${detail.membership?'member':'guest'}`} onJoin={startJoin} joinPending={pending} joinLabel={joinLabel} pageId={pageId} locale={locale} slug={page.slug} imageUrl={page.imageUrl} initialRoomId={initialRoomId}/>}
      {tab==='activities'&&<GroupActivitiesPanel pageId={pageId} locale={locale} pageName={page.name}/>}
      {tab==='events'&&<GroupEventsList pageId={pageId} locale={locale}/>}
      {tab==='collection'&&<GroupCollections key={`${g.ownerKey}:${pageId}`} pageId={pageId} locale={locale} pageName={page.name}/>}
    </div>{creator?<LinkedFanpageContent celebrity={creator} locale={locale} view="aside" returnTo={href(tab)}/>:<GroupSideRail locale={locale} pageId={pageId}/>}</div>}
  </>;
}
