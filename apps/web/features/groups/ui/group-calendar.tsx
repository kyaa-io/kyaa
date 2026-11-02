"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { LiveCalendarScreen, type GroupCalendarEntry } from "@/features/live/ui/live-calendar-screen";
import { buildLiveCalendarMonth, liveCalendarMonthSchema, resolveLiveCalendarMonth, type LiveCalendarMonth } from "@/features/live/domain/live-calendar";
import { groupEventsSchema } from "@/server/group-activities/domain";
import { groupDetailSchema, type GroupPage } from "../domain/contracts";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupsCopy } from "./copy";

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
    signal.throwIfAborted();
    for (const event of data.events) {
      if(event.state==='draft') continue;
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
export function GroupCalendarPanel({page,locale,month:requestedMonth,calendarPath}:{page:GroupPage;locale:AppLocale;month?:string;calendarPath:string}) {
  const month=resolveLiveCalendarMonth(requestedMonth,currentCalendarMonth());
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
  if(!current?.calendar)return <div role={current?.error?'alert':'status'}><p>{current?.error?t.error:t.loading}</p>{current?.error&&<FanAction onClick={retry}>{t.retry}</FanAction>}</div>;
  return <LiveCalendarScreen key={`${ownerKey}:${page.id}`} locale={locale} initialCalendar={current.calendar} celebrities={artists} eventMetadata={[]} initialCelebritySlugs={[]} embedded groupScope={scope} groupEntries={current.events} refreshLive={false}/>;
}
const parseDetail=(value:unknown)=>groupDetailSchema.parse(value);
export function CreatorGroupCalendar({slug,locale,month}:{slug:string;locale:AppLocale;month?:string}) {
  const r=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parseDetail),t=groupsCopy(locale);
  return r.data?<GroupCalendarPanel key={r.ownerKey} page={r.data.page} locale={locale} month={month} calendarPath={`/${slug}?tab=calendar`}/>:<div role={r.error?'alert':'status'}>{r.error?t.error:t.loading}{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</div>;
}
