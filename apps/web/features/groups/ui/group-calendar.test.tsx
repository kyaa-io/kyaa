import '@testing-library/jest-dom/vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { GroupCalendarPanel,loadGroupCalendar } from './group-calendar';
import { parseFanPageTab } from '@/features/fanpage/domain/board-navigation';
import { buildLiveCalendarMonth } from '@/features/live/domain/live-calendar';
import type { GroupPage } from '../domain/contracts';
const identity=vi.hoisted(()=>({ownerId:'owner',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:false,getAccessToken:async()=>null})}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,...identity})}));
const id='e9200000-0000-4000-8000-000000000003',other='e9200000-0000-4000-8000-000000000004';
const page:GroupPage={id,kind:'hobby',celebrityId:null,slug:null,name:'한강 러닝 크루',description:'달리기',imageUrl:null,question:null,memberCount:3};
const event={id,title:'새벽 러닝',description:'',imageUrl:null,startsAt:'2026-09-15T15:00:00Z',endsAt:'2026-09-15T16:00:00Z',opensAt:'2026-09-01T00:00:00Z',closesAt:'2026-09-14T00:00:00Z',location:'한강',capacity:null,requiresApproval:false,state:'published',revision:1,official:false,entryStatus:'none',ticketAvailable:false};
beforeEach(()=>{identity.ownerId='owner';identity.generation=0;vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));});
it('follows all group pages and KST month, using explicit own-event paths without global data',async()=>{
 const request=vi.fn(async(url:string)=>({events:[{...event,id:url.includes('cursor=')?other:id,startsAt:url.includes('cursor=')?'2026-08-31T16:00:00Z':event.startsAt}],canManage:false,nextCursor:url.includes('cursor=')?null:other}));
 const data=await loadGroupCalendar(request,page,'2026-09','ko',new AbortController().signal);
 expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.every(([url])=>url.startsWith(`/api/groups/${id}/events?`))).toBe(true);
 expect(data.events).toHaveLength(2);expect(data.events[0]?.group.detailHref).toBe(`/pages/groups/${id}/events/${id}?locale=ko`);expect(data.calendar.days).toHaveLength(30);
});
it('rejects cursor loops and aborted requests',async()=>{
 const request=vi.fn(async()=>({events:[],canManage:false,nextCursor:other}));
 await expect(loadGroupCalendar(request,page,'2026-09','ko',new AbortController().signal)).rejects.toThrow('INVALID_CURSOR');
 const controller=new AbortController();controller.abort();await expect(loadGroupCalendar(request,page,'2026-09','ko',controller.signal)).rejects.toThrow();
});
it('uses identity-bearing LIVE data only for linked creator, excluding other creators',async()=>{
 const artistPage={...page,kind:'fan' as const,celebrityId:other,slug:'nchive'};
 const calendar=buildLiveCalendarMonth({month:'2026-09',events:[{id,slug:'nchive-live',title:'엔카이브 LIVE',startsAt:event.startsAt,effectiveStatus:'scheduled',celebrity:{slug:'nchive',name:'엔카이브',image:'/images/avatars/star-pink.webp'},reservationState:null,hasBenefit:false},{id:other,slug:'other-live',title:'다른 아티스트',startsAt:event.startsAt,effectiveStatus:'scheduled',celebrity:{slug:'other',name:'Other',image:'/images/avatars/star-pink.webp'},reservationState:null,hasBenefit:false}]});
 const request=vi.fn(async(url:string)=>url.startsWith('/api/live-events')?calendar:{events:[],canManage:false,nextCursor:null});
 const data=await loadGroupCalendar(request,artistPage,'2026-09','ko',new AbortController().signal);
 expect(request.mock.calls[1]?.[0]).toContain('&identity=1');expect(data.calendar.days.flatMap(day=>day.events).map(row=>row.slug)).toEqual(['nchive-live']);
});
it('renders actual calendar, keeps group month navigation and real event links',async()=>{
 const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json({events:[event],canManage:false,nextCursor:null});}));
 const {container}=render(<GroupCalendarPanel page={page} locale='ko' month='2026-09' calendarPath={`/pages/groups/${id}?tab=calendar&returnTo=%2Fmy`}/>);
 const next=await screen.findByRole('link',{name:/다음 달:/});expect(next.getAttribute('href')).toContain('tab=calendar&returnTo=%2Fmy&month=2026-10');
 fireEvent.click(container.querySelector<HTMLButtonElement>('[data-calendar-date="2026-09-16"]')!);
 await waitFor(()=>expect(screen.getAllByRole('link',{name:'새벽 러닝 상세 보기'})[0]).toHaveAttribute('href',`/pages/groups/${id}/events/${id}?locale=ko`));
 expect(urls.every(url=>url.startsWith(`/api/groups/${id}/events?`))).toBe(true);
});
it('clears prior owner calendar and surfaces retry for failed reads',async()=>{
 let fail=false;vi.stubGlobal('fetch',vi.fn(async()=>fail?new Response('',{status:403}):Response.json({events:[event],canManage:false,nextCursor:null})));
 const props={page,locale:'ko' as const,month:'2026-09',calendarPath:`/pages/groups/${id}?tab=calendar`};const view=render(<GroupCalendarPanel {...props}/>);await screen.findByRole('link',{name:/다음 달:/});
 fail=true;identity.generation++;view.rerender(<GroupCalendarPanel {...props}/>);expect(screen.queryByRole('link',{name:/다음 달:/})).toBeNull();expect(await screen.findByRole('alert')).toBeInTheDocument();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));expect(await screen.findByRole('link',{name:/다음 달:/})).toBeInTheDocument();
});

it('recognizes creator calendar tab instead of silently returning home',()=>{expect(parseFanPageTab('calendar')).toBe('calendar');});
it('compact calendar loads with skeleton, navigates month locally and retains event details',async()=>{
 let finish!:(response:Response)=>void;
 vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockImplementation(async()=>Response.json({events:[event],canManage:false,nextCursor:null})));
 render(<GroupCalendarPanel page={page} locale='ko' month='2026-09' calendarPath={`/pages/groups/${id}?tab=calendar`} compact/>);
 expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');
 await waitFor(()=>expect(finish).toBeTypeOf('function'));finish(Response.json({events:[event],canManage:false,nextCursor:null}));
 const next=await screen.findByRole('button',{name:/다음 달:/});
 fireEvent.click(screen.getByRole('button',{name:/2026년 9월 16일/}));
 expect((await screen.findAllByRole('link',{name:'새벽 러닝 상세 보기'}))[0]).toHaveAttribute('href',`/pages/groups/${id}/events/${id}?locale=ko`);
 fireEvent.click(next);expect(await screen.findByRole('heading',{name:/2026년 10월/})).toBeVisible();
});
