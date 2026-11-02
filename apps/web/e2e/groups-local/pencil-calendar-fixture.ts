import type {LiveCalendarCelebrityFilter} from '../../features/live/ui/live-calendar-screen';
import type {AppLocale} from '../../i18n/locales';
import {buildLiveCalendarMonth} from '../../features/live/domain/live-calendar';
import {liveEventResponseSchema,type LiveEventResponse} from '../../features/live/domain/live-event';
import {createLiveReservationRequestSchema,createLiveReservationResponseSchema} from '../../features/live/domain/live-reservation';
import {scheduleSchema,liveSubmissionsPageSchema} from '../../features/schedules/domain/participation';
import {sourceCalendarArtists} from './pencil-calendar-artists';
export type PencilCalendarKind='all'|'fan'|'hobby'|'brand';
export const CALENDAR_SCHEDULE_ID='e9c10000-0000-4000-8000-000000000001';
export const CALENDAR_LIVE_ID='e9c20000-0000-4000-8000-000000000001';
export const CALENDAR_LIVE_SLUG='source-nchive-live';
export const calendarPhoto='/images/groups/source-calendar/nchive-calendar.jpg';
const subscriptions=new Set<string>(),reservedIds=new Set<string>(),reservationKeys=new Map<string,string>();
const stampId='e9c30000-0000-4000-8000-000000000001',now='2026-11-02T00:00:00Z';
export function calendarArtists(_locale:AppLocale,kind:PencilCalendarKind):LiveCalendarCelebrityFilter[]{
 if(kind==='fan')return [{slug:'nchive',name:'엔카이브',image:calendarPhoto,photos:{portrait:{asset:{id:'source-nchive-calendar',url:calendarPhoto,width:256,height:341,mimeType:'image/jpeg',revision:1},alt:{ko:'엔카이브',en:'NCHIVE'},frames:{'creator.calendar':{fit:'cover',x:50,y:50,approvedAssetRevision:1}},revision:1}}}];
 if(kind==='hobby'||kind==='brand')return [];
 return sourceCalendarArtists;
}
// Detail-only end times are explicit local examples; missing source/place/instructions are never presented as operational metadata.
export function calendarSchedule(id=CALENDAR_SCHEDULE_ID){return scheduleSchema.parse({id,celebrityId:CALENDAR_LIVE_ID,celebritySlug:'hangang-running',celebrityName:'한강 러닝 크루',kind:'event',title:id.endsWith('002')?'정기 모임':'함께 달리기',description:'',startsAt:id.endsWith('002')?'2026-11-07T10:00:00Z':'2026-11-14T09:00:00Z',endsAt:id.endsWith('002')?'2026-11-07T12:00:00Z':'2026-11-14T11:00:00Z',timeZone:'Asia/Seoul',location:'',participationInstructions:'',officialSourceUrl:'https://example.com/source-calendar-fixture',status:'published',revision:1,subscribed:subscriptions.has(id),detailHref:`/live/calendar/schedules/${id}`});}
export function calendarLive(slug=CALENDAR_LIVE_SLUG):LiveEventResponse{if(slug.startsWith("source-ifew-")){const day=Number(slug.split("-").at(-1)),event=pencilCalendarMonth().days[day-1]?.events[0];if(event){const base=calendarLive();return liveEventResponseSchema.parse({...base,live:{...base.live,id:event.id,slug,startsAt:event.startsAt,reservationClosesAt:event.startsAt,title:event.title,description:event.title,heroImage:{url:event.celebrity.image,alt:"이퓨"},celebrity:{slug:"ifew",name:"이퓨",image:event.celebrity.image,fanCount:1280}},viewer:{...base.viewer,reservation:reservedIds.has(event.id)?reservation(event.id):null},primaryAction:reservedIds.has(event.id)?"reserved":Date.parse(event.startsAt)<Date.now()?"reservation_closed":"reserve"});}}return liveEventResponseSchema.parse({live:{id:CALENDAR_LIVE_ID,slug:CALENDAR_LIVE_SLUG,liveType:'recurring',effectiveStatus:'scheduled',startsAt:'2026-11-07T10:00:00Z',endsAt:null,reservationOpensAt:'2026-10-01T00:00:00Z',reservationClosesAt:'2026-11-07T10:00:00Z',title:'엔카이브 팬 LIVE',description:'엔카이브와 함께하는 팬 LIVE',productContext:null,missionsAvailable:false,heroImage:{url:calendarPhoto,alt:'엔카이브'},celebrity:{slug:'nchive',name:'엔카이브',image:calendarPhoto,fanCount:1280},brand:null,watch:{available:false,mode:'unavailable',provider:'youtube',url:'https://www.youtube.com/@NCHIVE/live'}},viewer:{authenticated:true,passport:'active',reservation:reservedIds.has(CALENDAR_LIVE_ID)?reservation():null},primaryAction:reservedIds.has(CALENDAR_LIVE_ID)?'reserved':'reserve'});}
const reservation=(id=CALENDAR_LIVE_ID)=>({id,createdAt:now,stamp:{id:id===CALENDAR_LIVE_ID?stampId:id.replace('e9c4','e9c3'),businessStatus:'issued' as const,mintStatus:'queued' as const}});
export function pencilCalendarMonth(month='2026-11',kind:PencilCalendarKind='all'){
 const events=kind==='all'&&month==='2026-11'?Array.from({length:30},(_,i)=>i+1).filter(day=>![0,6].includes(new Date(Date.UTC(2026,10,day)).getUTCDay())).map(day=>({id:`e9c40000-0000-4000-8000-${String(day).padStart(12,'0')}`,slug:`source-ifew-${day}`,startsAt:`2026-11-${String(day).padStart(2,'0')}T07:00:00+09:00`,effectiveStatus:'scheduled',title:'이퓨 정기 LIVE',celebrity:{name:'이퓨',slug:'ifew',image:calendarArtists('ko','all').find(artist=>artist.slug==='ifew')?.image??'/images/avatars/star-pink.webp'},reservationState:null,hasBenefit:false})):[];
 return buildLiveCalendarMonth({month,events});
}
/** Explicit in-memory source examples using existing transport shapes. Never installed outside the local harness. */
export function calendarPreviewFixture(url:URL,method:string,body:Record<string,unknown>|undefined,kind:PencilCalendarKind):Response|undefined{
 const path=url.pathname;
 if(/^\/api\/live-events\/source-(?:nchive-live|ifew-\d+)\/submissions$/.test(path)&&method==='GET')return Response.json(liveSubmissionsPageSchema.parse({items:[],nextCursor:null,mine:[],access:'public',settings:{accepting:false,closesAt:null,visibility:'public',revision:1}}));
 if(path==='/api/live-events/calendar'&&method==='GET')return Response.json(pencilCalendarMonth(url.searchParams.get('month')??'2026-11',kind));
 if(path==='/api/schedules'&&method==='GET'){const month=url.searchParams.get('month')??'2026-11',slug=url.searchParams.get('celebritySlug');const schedules=kind==='hobby'&&month==='2026-11'?[calendarSchedule(),calendarSchedule('e9c10000-0000-4000-8000-000000000002')]:[];return Response.json({items:schedules.filter(row=>!slug||row.celebritySlug===slug),nextCursor:null});}
 const scheduleMatch=path.match(/^\/api\/schedules\/(e9c10000-0000-4000-8000-00000000000[12])(?:\/(subscription))?$/);
 if(scheduleMatch&&!scheduleMatch[2]&&method==='GET')return Response.json(calendarSchedule(scheduleMatch[1]));
 if(scheduleMatch?.[2]==='subscription'&&method==='PUT'){if(typeof body?.subscribed!=='boolean'||Object.keys(body).length!==1)return Response.json({error:{code:'FAN_WEB_INVALID_INPUT'}},{status:400});if(body.subscribed)subscriptions.add(scheduleMatch[1]!);else subscriptions.delete(scheduleMatch[1]!);return Response.json({scheduleId:scheduleMatch[1],subscribed:body.subscribed});}
 if((path===`/api/live-events/${CALENDAR_LIVE_SLUG}`||/^\/api\/live-events\/source-ifew-\d+$/.test(path))&&method==='GET')return Response.json(calendarLive(path.split('/').at(-1)));
 const reservationMatch=path.match(/^\/api\/live-events\/(e9c[24]0000-0000-4000-8000-\d{12})\/reservation$/);
 if(reservationMatch&&method==='POST'){if(!createLiveReservationRequestSchema.safeParse(body).success)return Response.json({error:{code:'FAN_WEB_INVALID_INPUT'}},{status:400});const eventId=reservationMatch[1]!;if(eventId!==CALENDAR_LIVE_ID&&!pencilCalendarMonth().days.some(day=>day.events.some(event=>event.id===eventId)))return Response.json({error:{code:'FAN_WEB_NOT_FOUND'}},{status:404});const key=String(body!.idempotencyKey),previous=reservationKeys.get(key);if(previous&&previous!==eventId)return Response.json({error:{code:'FAN_WEB_CONFLICT'}},{status:409});reservationKeys.set(key,eventId);reservedIds.add(eventId);return Response.json(createLiveReservationResponseSchema.parse({reservation:reservation(eventId),completion:{passportId:'c7640000-0000-4000-8000-000000000001',earnedStamp:{id:reservation(eventId).stamp.id,type:'reservation',issuedAt:now,businessStatus:'issued',mintStatus:'queued'},scoreDelta:1,updatedScore:241,updatedLevel:'Silver',leveledUp:false}}));}
}
