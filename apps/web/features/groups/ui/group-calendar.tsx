"use client";
import {isEventOpen} from '@/features/group-event-approval/event-approval-status';
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { LiveCalendarScreen, type GroupCalendarEntry } from "@/features/live/ui/live-calendar-screen";
import { buildLiveCalendarMonth, liveCalendarMonthSchema, resolveLiveCalendarMonth, type LiveCalendarMonth } from "@/features/live/domain/live-calendar";
import { groupEventsSchema } from "@/server/group-activities/domain";
import { groupDetailSchema, type GroupPage } from "../domain/contracts";
import { useOptionalGroupPage } from "./group-page-context";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupsCopy } from "./copy";
import calendarStyles from "@/features/live/ui/live-calendar-screen.module.css";
import skeletonStyles from "@/features/live/ui/live-catalog-screen.module.css";

const noSelectedCelebrities:string[]=[];
function CalendarLoading({label,compact}:{label:string;compact:boolean}) {
 return <div role="status" aria-busy="true" aria-label={label} className={compact?calendarStyles.compactSkeleton:calendarStyles.fullSkeleton}><span aria-hidden="true" className={`${skeletonStyles.actionSkeleton} ${calendarStyles.skeletonArt}`}/><span aria-hidden="true" className={`${skeletonStyles.actionSkeleton} ${calendarStyles.skeletonMonth}`}/><div aria-hidden="true" className={calendarStyles.skeletonGrid}>{Array.from({length:35},(_,i)=><span className={skeletonStyles.actionSkeleton} key={i}/>)}</div></div>;
}
export function currentCalendarMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
}
export async function loadGroupCalendar(request: (url:string,input?:RequestInit)=>Promise<unknown>, page:GroupPage, month:string, locale:AppLocale, signal:AbortSignal) {
  const events: GroupCalendarEntry[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({limit:"100"});
    if(cursor) query.set("cursor",cursor);
    const data=groupEventsSchema.parse(await request(`/api/groups/${page.id}/events?${query}`,{signal}));
    throwIfAborted(signal);
    for (const event of data.events) {
      if(event.state==='draft'||!isEventOpen(event)) continue;
      const date = new Date(Date.parse(event.startsAt)+9*60*60*1000).toISOString().slice(0,10);
      if(!date.startsWith(`${month}-`)) continue;
      events.push({id:event.id,title:event.title,startsAt:event.startsAt,effectiveStatus:event.state==='cancelled'?'cancelled':event.state==='ended'||Date.parse(event.endsAt)<=Date.now()?'ended':'scheduled',reservationState:null,
        group:{name:page.name,imageUrl:event.imageUrl??page.imageUrl,detailHref:`/pages/groups/${page.id}/events/${event.id}?locale=${locale}`}});
    }
    cursor=data.nextCursor;
    if(cursor&&seen.has(cursor))throw new Error("INVALID_CURSOR");
    if(cursor)seen.add(cursor);
  } while(cursor);
  let calendar=buildLiveCalendarMonth({month,events:[]});
  if(page.celebrityId&&page.slug){
    const value=await request(`/api/live-events/calendar?month=${month}&locale=${toContentLocale(locale)}&identity=1`,{signal});
    const raw=liveCalendarMonthSchema.parse(value);
    if(raw.month!==month)throw new Error("INVALID_CALENDAR_MONTH");
    calendar={...raw,days:raw.days.map(day=>({...day,events:day.events.filter(event=>event.celebrity.slug===page.slug)}))};
  }
  return {calendar,events};
}
export function GroupCalendarPanel({page,locale,month:requestedMonth,calendarPath,compact=false,onCompactMonthChange}:{page:GroupPage;locale:AppLocale;month?:string;calendarPath:string;compact?:boolean;onCompactMonthChange?:(month:string)=>void}) {
  const [compactMonth,setCompactMonth]=useState(()=>resolveLiveCalendarMonth(requestedMonth,currentCalendarMonth()));
  const month=compact?compactMonth:resolveLiveCalendarMonth(requestedMonth,currentCalendarMonth());
  const {request,ready,ownerKey}=useGroupRequest(),t=groupsCopy(locale);
  const [revision,setRevision]=useState(0),[snapshot,setSnapshot]=useState<{key:string;calendar?:LiveCalendarMonth;events?:GroupCalendarEntry[];error?:boolean}>();
  const key=`${ownerKey}:${page.id}:${page.slug}:${month}:${locale}:${revision}`;
  const retry=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    if(!ready)return;
    const controller=new AbortController();
    void loadGroupCalendar(request,page,month,locale,controller.signal).then(data=>{if(!controller.signal.aborted)setSnapshot({key,...data});}).catch(()=>{if(!controller.signal.aborted)setSnapshot({key,error:true});});
    return()=>controller.abort();
  },[key,ready,request,page,month,locale]);
  const scope=useMemo(()=>({calendarPath,celebritySlug:page.celebrityId&&page.slug?page.slug:undefined}),[calendarPath,page.celebrityId,page.slug]);
  const artists=useMemo(()=>scope.celebritySlug?[{slug:scope.celebritySlug,name:page.name,image:page.imageUrl??"/images/avatars/star-pink.webp"}]:[],[scope.celebritySlug,page.name,page.imageUrl]);
  const current=snapshot?.key===key?snapshot:undefined;
  if(!current?.calendar)return current?.error?<div role='alert'><p>{t.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>:<CalendarLoading label={t.loading} compact={compact}/>;
  return <LiveCalendarScreen key={`${ownerKey}:${page.id}`} locale={locale} initialCalendar={current.calendar} celebrities={artists} eventMetadata={[]} initialCelebritySlugs={noSelectedCelebrities} embedded groupScope={scope} groupEntries={current.events} refreshLive={false} compact={compact} onMonthChange={compact?(value)=>{setCompactMonth(value);onCompactMonthChange?.(value);}:undefined}/>;
}
const parseDetail=(value:unknown)=>groupDetailSchema.parse(value);
export function CreatorGroupCalendar({slug,locale,month,compact=false,onCompactMonthChange}:{slug:string;locale:AppLocale;month?:string;compact?:boolean;onCompactMonthChange?:(month:string)=>void}) {
  const framed=useOptionalGroupPage(),r=useGroupResource(framed?null:`/api/groups/resolve/${encodeURIComponent(slug)}`,parseDetail),detail=framed?framed.detail:r.data,failed=framed?framed.error:r.error,retry=framed?framed.refresh:r.retry,t=groupsCopy(locale);
  return detail?<GroupCalendarPanel key={framed?framed.ownerKey:r.ownerKey} page={detail.page} locale={locale} month={month} calendarPath={`/${slug}?tab=calendar`} compact={compact} onCompactMonthChange={onCompactMonthChange}/>:failed?<div role='alert'><p>{t.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>:<CalendarLoading label={t.loading} compact={compact}/>;
}
