"use client";
import {useEffect,useId,useState} from 'react';
import type {Route} from 'next';
import Link from 'next/link';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanSkeleton,FanSkeletonStatus} from '@/components/fan-ui/fan-skeleton';
import {CalendarDayNumber,CalendarMonthHeader} from '@/components/fan-calendar/calendar-parts';
import {adjacentCalendarMonth,calendarWeekday,currentKstDate,formatMiniCalendarDate,MiniCalendarEventDay,miniCalendarCopy,miniCalendarMonthLabel} from '@/features/fanpage/ui/celebrity-calendar';
import calendarStyles from '@/features/fanpage/ui/calendar.module.css';
import {buildLiveCalendarMonth} from '@/features/live/domain/live-calendar';
import type {GroupCalendarEntry} from '@/features/live/ui/live-calendar-screen';
import {participationCopy} from '@/i18n/catalogs/features__schedules__ui__participation';
import type {AppLocale} from '@/i18n/locales';
import type {GroupPage} from '../domain/contracts';
import {creatorHomeCardCopy} from './creator-home-card-copy';
import {loadGroupCalendar} from './group-calendar';
import {groupsCopy} from './copy';
import {useGroupRequest} from './use-group-resource';
import styles from './groups.module.css';
import cardStyles from './creator-schedule-card.module.css';

/** 크리에이터가 연결되지 않은 모임·취미·브랜드의 `다가오는 일정`. 팬페이지 사이드 달력과 같은 모양이고 값은 그 모임의 행사다. 달력은 바로 그리고 일정만 뒤에 채운다. */
export function GroupScheduleCard({page,locale,calendarHref}:{page:GroupPage;locale:AppLocale;calendarHref:string}){
 const today=currentKstDate(),[month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const {request,ready,ownerKey}=useGroupRequest(),listId=useId();
 const [snapshot,setSnapshot]=useState<{key:string;events?:GroupCalendarEntry[];failed?:boolean}>();
 const key=`${ownerKey}:${page.id}:${month}:${locale}:${revision}`;
 useEffect(()=>{
  if(!ready)return;
  const controller=new AbortController();
  void loadGroupCalendar(request,page,month,locale,controller.signal).then(data=>{if(!controller.signal.aborted)setSnapshot({key,events:data.events});}).catch(()=>{if(!controller.signal.aborted)setSnapshot({key,failed:true});});
  return()=>controller.abort();
 },[key,ready,request,page,month,locale]);
 const current=snapshot?.key===key?snapshot:undefined,events=current?.events??[],t=miniCalendarCopy[locale],card=creatorHomeCardCopy(locale),participation=participationCopy(locale);
 const days=buildLiveCalendarMonth({month,events:[]}).days;
 const eventsOn=(date:string)=>events.filter(event=>currentKstDate(new Date(event.startsAt))===date);
 const selectedEvents=selected?eventsOn(selected):[];
 const shown=selectedEvents.length?selectedEvents:events.filter(event=>event.effectiveStatus==='scheduled'&&currentKstDate(new Date(event.startsAt))>=today).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).slice(0,3);
 const previous=adjacentCalendarMonth(month,-1),next=adjacentCalendarMonth(month,1);
 const move=(value:string)=>{setSelected(null);setMonth(value);};
 return <section className={styles.sourceHomeCard} data-group-schedule>
  <header className={cardStyles.header}><h2>{card.schedule}</h2><FanAction className={cardStyles.action} variant='text' href={calendarHref}>{card.calendar}</FanAction></header>
  <section className={`${calendarStyles.heroCalendar} ${calendarStyles.embedded}`} aria-label={`${page.name} ${participation.schedules}`} aria-busy={!current||undefined}>
   <CalendarMonthHeader month={month} label={miniCalendarMonthLabel(month,locale)} density='compact' previous={{onClick:()=>move(previous),label:`${t.previousMonth}: ${miniCalendarMonthLabel(previous,locale)}`}} next={{onClick:()=>move(next),label:`${t.nextMonth}: ${miniCalendarMonthLabel(next,locale)}`}}/>
   <div className={calendarStyles.calendarWeekdays} aria-hidden='true'>{t.weekdays.map(weekday=><span key={weekday}>{weekday}</span>)}</div>
   <div className={calendarStyles.calendarDays}>{days.map((day,index)=>{
    const style=index===0?{gridColumnStart:calendarWeekday(day.date)+1}:undefined,list=eventsOn(day.date);
    if(!list.length)return <span className={calendarStyles.calendarDay} data-today={day.date===today?'true':undefined} key={day.date} style={style}><CalendarDayNumber date={day.date} today={today}/></span>;
    return <MiniCalendarEventDay key={day.date} date={day.date} today={today} count={list.length} upcoming={list.some(event=>event.effectiveStatus==='scheduled')} pressed={selected===day.date} controls={listId} label={`${Number(day.date.slice(-2))}, ${participation.schedules} ${list.length}`} style={style} onClick={()=>setSelected(selected===day.date?null:day.date)}/>;
   })}</div>
   {!current&&<FanSkeletonStatus locale={locale} label={t.calendarLoading}/>}
   {current?.failed&&<div className={calendarStyles.calendarMessage} role='alert'><p>{t.calendarError}</p><FanAction onClick={()=>setRevision(value=>value+1)}>{groupsCopy(locale).retry}</FanAction></div>}
   <div className={calendarStyles.calendarUpcoming} id={listId}>
    <div className={calendarStyles.calendarListHeading}><h3 aria-live='polite'>{selected&&selectedEvents.length?new Intl.DateTimeFormat(locale,{calendar:'gregory',timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'}).format(new Date(`${selected}T00:00:00+09:00`)):t.calendarUpcoming}</h3></div>
    {shown.length?<ol>{shown.map(event=><li key={event.id} data-status={event.effectiveStatus}><Link href={event.group.detailHref as Route}><time dateTime={event.startsAt}>{formatMiniCalendarDate(event.startsAt,locale)}</time><strong translate='no'>{event.title}</strong></Link></li>)}</ol>:current?.events?<p>{participation.empty}</p>:current?null:<FanSkeleton width='60%' height={34}/>}
   </div>
  </section>
 </section>;
}
