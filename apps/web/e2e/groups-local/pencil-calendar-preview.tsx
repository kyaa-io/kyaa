import type {ReactNode} from 'react';
import type {AppLocale} from '../../i18n/locales';
import {resolveLiveCalendarMonth} from '../../features/live/domain/live-calendar';
import {LiveCalendarScreen} from '../../features/live/ui/live-calendar-screen';
import {LiveEventScreen} from '../../features/live/ui/live-event-screen';
import {ScheduleDetail} from '../../features/schedules/ui/schedule-detail';
import {GroupShell} from '../../features/groups/ui/group-shell';
import Link from 'next/link';
import type {Route} from 'next';
import {UsersRound,Plus} from 'lucide-react';
import {GroupPageMenu} from '../../features/groups/ui/group-page-menu';
import {GroupAvatar} from '../../features/groups/ui/group-shell';
import {groupDetailSchema} from '../../features/groups/domain/contracts';
import {useGroupResource} from '../../features/groups/ui/use-group-resource';
import groupStyles from '../../features/groups/ui/groups.module.css';
import {FanAction} from '../../components/fan-ui/fan-action';
import {calendarArtists,calendarLive,pencilCalendarMonth,CALENDAR_LIVE_SLUG,CALENDAR_SCHEDULE_ID,type PencilCalendarKind} from './pencil-calendar-fixture';
import './pencil-calendar-preview.css';
export function PencilCalendarPreview({locale,kind='all',month:requestedMonth='2026-11',header,bodyOnly=false}:{locale:AppLocale;kind?:PencilCalendarKind;month?:string;header?:ReactNode;bodyOnly?:boolean}){
 const month=resolveLiveCalendarMonth(requestedMonth,'2026-11');
 const scope=kind==='fan'?'nchive':kind==='hobby'?'hangang-running':kind==='brand'?'runmusic':undefined;
 const path=kind==='fan'?'/nchive?tab=calendar':kind==='brand'?'/pages/groups/e9200000-0000-4000-8000-000000000004?tab=calendar':'/pages/groups/e9200000-0000-4000-8000-000000000003?tab=calendar';
 const calendar=<LiveCalendarScreen locale={locale} embedded={kind!=='all'||bodyOnly} initialSelectedDate={bodyOnly?`${month}-02`:undefined} groupScope={scope?{celebritySlug:scope,calendarPath:path}:undefined} initialCalendar={pencilCalendarMonth(month,kind)} celebrities={calendarArtists(locale,kind)} eventMetadata={pencilCalendarMonth(month,kind).days.flatMap(day=>day.events.map(event=>({eventSlug:event.slug,celebritySlug:'ifew',platforms:['tiktok' as const]})))} initialCelebritySlugs={scope?[scope]:new URLSearchParams(window.location.search).getAll('celebrity')}/>;
 if(kind==='all')return <div className={bodyOnly?'pencil-calendar-body-only':'pencil-calendar-all'}>{calendar}</div>;
 return <GroupShell locale={locale}>{header??<CalendarGroupHeader locale={locale} kind={kind==='brand'?'brand':'hobby'}/>}<div className='pencil-calendar-preview' data-kind={kind}>{kind==='brand'&&<section className='pencil-calendar-empty'><h2>캘린더</h2><h3>{month.replace('-','년 ')}월</h3><p>등록된 브랜드 일정이 없어요.</p><FanAction onClick={()=>location.reload()}>다시 확인</FanAction></section>}{calendar}</div></GroupShell>;
}
/** GOlB1/BfUw9 explicitly exclude their draft unified reservation form. Keep the existing two detail flows. */
export function PencilCalendarDetail({locale,kind='live',liveSlug=CALENDAR_LIVE_SLUG,scheduleId=CALENDAR_SCHEDULE_ID}:{locale:AppLocale;kind?:'live'|'schedule';liveSlug?:string;scheduleId?:string}){return kind==='schedule'?<ScheduleDetail locale={locale} id={scheduleId}/>:<LiveEventScreen locale={locale} slug={liveSlug} initialData={calendarLive(liveSlug)}/>;}

const parseGroup=(value:unknown)=>groupDetailSchema.parse(value);
function CalendarGroupHeader({locale,kind}:{locale:AppLocale;kind:'hobby'|'brand'}){
 const id=kind==='brand'?'e9200000-0000-4000-8000-000000000004':'e9200000-0000-4000-8000-000000000003',path=`/pages/groups/${id}`,resource=useGroupResource(`/api/groups/${id}`,parseGroup),page=resource.data?.page;
 return <><header className={`${groupStyles.identity} pencil-calendar-group-header`} data-calendar-group-kind={kind}>{page&&<GroupAvatar page={page} locale={locale}/>}<div className={groupStyles.identityCopy}><h1>{kind==='brand'?'RUN&MUSIC FESTIVAL':'한강 러닝 크루'}</h1><p className={groupStyles.meta}>{kind==='brand'?'브랜드 · 러닝과 음악을 함께':'취미 · 회원 84명'}</p></div><FanAction variant='primary' trailingIcon={kind==='brand'?<Plus size={20}/>:undefined} href={`${path}?locale=${locale}&tab=home`}>{kind==='brand'?'브랜드 가입':'가입하기'}</FanAction></header><div className='pencil-calendar-navigation'><nav className={groupStyles.tabs} aria-label='모임 메뉴'>{[['home','홈'],['board','게시판'],['rooms','비밀방'],['calendar','캘린더']].map(([tab,label])=><Link key={tab} className={groupStyles.tab} href={`${path}?locale=${locale}&tab=${tab}` as Route} aria-current={tab==='calendar'?'page':undefined}>{label}</Link>)}</nav><div className='pencil-calendar-group-tools'><Link className={groupStyles.chip} href={`${path}?locale=${locale}&tab=members` as Route}><UsersRound size={18}/>회원·랭킹</Link>{resource.data&&<GroupPageMenu detail={resource.data} locale={locale} refresh={resource.retry}/>}</div></div></>;
}
