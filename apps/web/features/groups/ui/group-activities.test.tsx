import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeAll,afterAll,expect,it,vi } from 'vitest';
import { GroupEventScreen } from './group-event-screen';
import { GroupEventsList,GroupCollections } from './group-activities';
import { eventParticipationCopy, eventActionCopy, eventStateCopy, eventCheckInCopy } from './event-participation-copy';
import { activitiesCopy } from './activities-copy';
import { APP_LOCALES } from '@/i18n/locales';
import { activityFixture,fixtureId } from '../../../e2e/groups-local/activity-fixtures';
const proto=HTMLDialogElement.prototype,show=Object.getOwnPropertyDescriptor(proto,'showModal'),close=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(show)Object.defineProperty(proto,'showModal',show);else Reflect.deleteProperty(proto,'showModal');if(close)Object.defineProperty(proto,'close',close);else Reflect.deleteProperty(proto,'close');});
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:0})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
it('has complete activity labels in every supported language',()=>{for(const locale of APP_LOCALES){expect(Object.values(activitiesCopy(locale)).every(Boolean)).toBe(true);expect(eventParticipationCopy[locale]).toHaveLength(2);expect(eventActionCopy[locale]).toHaveLength(10);expect(eventStateCopy[locale]).toHaveLength(6);expect(eventCheckInCopy[locale]).toHaveLength(3);}});
it('keeps pending applications separate from confirmed QR tickets',async()=>{
 const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(activityFixture(url,'GET','pending'));}));
 render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 await screen.findByRole('heading',{name:'한강 러닝 크루 정기 모임'});
 expect(await screen.findByText(eventStateCopy.ko[0])).toBeInTheDocument();expect(urls.some(url=>url.endsWith('/ticket'))).toBe(false);expect(screen.queryByRole('img',{name:activitiesCopy('ko').ticket})).not.toBeInTheDocument();
});
it('loads later event cards with a cursor without dropping the first page',async()=>{
 const second='e9200000-0000-4000-8000-000000000002';const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);const data=activityFixture(`/api/groups/${fixtureId}/events`,'GET',null) as {events:Record<string,unknown>[]};return Response.json({events:url.includes('cursor=')?[{...data.events[0],id:second,title:'두 번째 행사'}]:data.events,canManage:false,nextCursor:url.includes('cursor=')?null:fixtureId});}));
 render(<GroupEventsList pageId={fixtureId} locale='ko'/>);await screen.findByText('한강 러닝 크루 정기 모임');fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByText('두 번째 행사');expect(screen.getByText('한강 러닝 크루 정기 모임')).toBeInTheDocument();expect(urls.some(url=>url.includes(`cursor=${fixtureId}`))).toBe(true);
});
it('preserves the collection destination query and hash',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(activityFixture(`/api/groups/${fixtureId}/collections`,'GET',null))));render(<GroupCollections pageId={fixtureId} locale='ko'/>);
 await waitFor(()=>expect(screen.getByRole('link',{name:'판매처에서 보기'})).toHaveAttribute('href','https://kyaa.io/?utm_source=fixture#collection'));
});
it('keeps confirmed attendance separate from manual check-in and requires a reason',async()=>{
 const {GroupEventOperations}=await import('./group-event-operations');const writes:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(input?.method==='POST'){writes.push(JSON.parse(input.body as string));return Response.json({status:'checked_in',registrationId:fixtureId,checkedInAt:'2026-11-07T09:00:00Z',alreadyCheckedIn:false,replayed:false});}if(url.includes('/participants'))return Response.json({items:[{id:fixtureId,appUserId:fixtureId,nickname:'하늘',avatarUrl:null,status:'confirmed',checkedInAt:null}],nextCursor:null});return Response.json(url.endsWith('/support')?{attendanceCount:0,reviewCount:0,items:[],nextCursor:null}:{items:[],nextCursor:null});}));
 render(<GroupEventOperations pageId={fixtureId} eventId={fixtureId} locale='ko' refresh={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'수동 체크인'}));expect(writes).toHaveLength(0);fireEvent.change(screen.getByRole('textbox',{name:'확인한 참가자 이름'}),{target:{value:'하늘'}});fireEvent.change(screen.getByRole('textbox',{name:'QR 확인 불가 사유'}),{target:{value:'휴대전화 배터리 소진'}});fireEvent.click(screen.getAllByRole('button',{name:'수동 체크인'}).at(-1)!);await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({confirmedName:'하늘',reason:'휴대전화 배터리 소진'});
});
it('links operators to the actual support estimate and review history',async()=>{
 const {GroupEventOperations}=await import('./group-event-operations');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[],nextCursor:null})));
 render(<GroupEventOperations pageId={fixtureId} eventId={fixtureId} locale='ko' refresh={()=>{}}/>);
 expect(screen.getByRole('link',{name:'행사 지원금 산정'})).toHaveAttribute('href',`/pages/groups/${fixtureId}/events/${fixtureId}/support?locale=ko`);
 expect(screen.getByRole('link',{name:'정산 검토 내역'})).toHaveAttribute('href',`/pages/groups/${fixtureId}/events/${fixtureId}/support?locale=ko&view=history`);
});

it('loads a confirmed ticket only when the participant opens it',async()=>{
 const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(activityFixture(url,'GET','confirmed'));}));
 render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);const button=await screen.findByRole('button',{name:'내 QR 티켓 보기'});expect(urls.some(url=>url.endsWith('/ticket'))).toBe(false);expect(button).toHaveAttribute('aria-expanded','false');fireEvent.click(button);await waitFor(()=>expect(urls.some(url=>url.endsWith('/ticket'))).toBe(true));expect(button).toHaveAttribute('aria-expanded','true');
});

it('keeps the review editor closed until an eligible participant chooses to write',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','review'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 fireEvent.click((await screen.findAllByRole('button',{name:/후기 쓰기/}))[0]);expect(await screen.findByRole('textbox',{name:'후기 내용'})).toBeInTheDocument();
});
it('shows the three actions but prevents unavailable participation actions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','pending'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 expect(await screen.findByRole('button',{name:'내 QR 티켓 보기'})).toBeDisabled();expect(screen.getByRole('button',{name:'현장 QR 스캔'})).toBeDisabled();expect(screen.getByRole('button',{name:/후기 쓰기/})).toBeDisabled();
});

it.each([['cancelled',3],['closed',1]] as const)('explains the %s event state and does not offer an application',async(state,index)=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET',state))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 expect(await screen.findByRole('heading',{name:eventStateCopy.ko[index]})).toBeInTheDocument();expect(screen.getByText(eventStateCopy.ko[index+1])).toBeInTheDocument();expect(screen.queryByRole('button',{name:activitiesCopy('ko').apply})).not.toBeInTheDocument();
});

it('labels the opened ticket with its event and authenticated participant',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','confirmed'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 fireEvent.click(await screen.findByRole('button',{name:'내 QR 티켓 보기'}));expect(await screen.findByText(`하늘 · ${activitiesCopy('ko').confirmed}`)).toBeInTheDocument();expect(screen.getAllByRole('heading',{name:'한강 러닝 크루 정기 모임'})).toHaveLength(2);
});
it('shows actual checked-in completion without enabling a premature review',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','checked-in'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 expect(await screen.findByRole('heading',{name:'현장 참여 완료'})).toBeInTheDocument();expect(screen.getByRole('link',{name:'미션 보기'})).toHaveAttribute('href',`/pages/groups/${fixtureId}?locale=ko&tab=activities&activity=missions`);for(const button of screen.getAllByRole('button',{name:/후기 쓰기/}))expect(button).toBeDisabled();
});

it('selects actual collection products and source presentation categories while honoring sold-out state',async()=>{
 const second='e9200000-0000-4000-8000-000000000002';
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id:fixtureId,title:'포토카드',imageUrl:'/card.png',externalUrl:'https://example.com/card?keep=1#item',status:'active',revision:1},{id:second,title:'아크릴 키링',imageUrl:'/keyring.png',externalUrl:'https://example.com/keyring',status:'sold_out',revision:1}],canManage:false,nextCursor:null})));
 render(<GroupCollections pageId={fixtureId} locale='ko' heading='엔카이브 컬렉션' sellerLabel='NCHIVE 공식 스토어' categories={[{id:'all',label:'전체',itemIds:[fixtureId,second]},{id:'daily',label:'일상',itemIds:[]},{id:'collection',label:'컬렉션',itemIds:[second]}]}/>);
 await screen.findByRole('button',{name:'포토카드'});
 expect(screen.getByRole('img',{name:'포토카드'})).toHaveAttribute('src','/card.png');
 expect(screen.getByRole('link',{name:'판매처에서 보기'})).toHaveAttribute('href','https://example.com/card?keep=1#item');
 fireEvent.click(screen.getByRole('button',{name:'아크릴 키링'}));
 expect(screen.getByRole('img',{name:'아크릴 키링'})).toHaveAttribute('src','/keyring.png');
 expect(screen.queryByRole('link',{name:'판매처에서 보기'})).toBeNull();
 expect(screen.getByText('판매가 종료된 상품이에요')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'일상'}));
 expect(screen.queryByRole('img')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'컬렉션'}));
 expect(screen.getByRole('button',{name:'아크릴 키링'})).toHaveAttribute('aria-pressed','true');
 expect(screen.queryByRole('button',{name:'포토카드'})).toBeNull();
});
it('posts a review through the existing API and preserves the draft and idempotency key after failure',async()=>{
 const writes:{url:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(input?.method==='POST'){writes.push({url,body:JSON.parse(input.body as string)});return writes.length===1?Response.json({error:{code:'UNAVAILABLE'}},{status:503}):Response.json({id:fixtureId});}return Response.json(activityFixture(url,'GET','review'));}));
 render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);fireEvent.click((await screen.findAllByRole('button',{name:/후기 쓰기/}))[0]);const field=screen.getByRole('textbox',{name:'후기 내용'});fireEvent.change(screen.getByRole('textbox',{name:'후기 제목'}),{target:{value:'직접 쓴 후기 제목'}});fireEvent.change(field,{target:{value:'현장에서 함께한 후기'}});fireEvent.submit(field.closest('form')!);await screen.findAllByRole('alert');expect(field).toHaveValue('현장에서 함께한 후기');expect(screen.getByRole('dialog')).toBeInTheDocument();fireEvent.submit(field.closest('form')!);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(writes).toHaveLength(2);expect(writes[0].url).toBe(`/api/groups/${fixtureId}/events/${fixtureId}/review`);expect(writes[0].body).toMatchObject({body:'현장에서 함께한 후기',title:'직접 쓴 후기 제목'});expect(writes[0].body.requestId).toBe(writes[1].body.requestId);
});
it('opens the mission task and submits its body to the existing mission API',async()=>{
 const {GroupMissionScreen}=await import('./group-mission-screen'),writes:{url:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(input?.method==='POST'){writes.push({url,body:JSON.parse(input.body as string)});return Response.json({id:fixtureId});}return Response.json(activityFixture(url,'GET',null));}));
 render(<GroupMissionScreen pageId={fixtureId} missionId={fixtureId} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'인증 제출'}));const field=screen.getByRole('textbox',{name:'내용'});fireEvent.change(field,{target:{value:'오늘의 참여 기록'}});fireEvent.submit(field.closest('form')!);await waitFor(()=>expect(writes).toHaveLength(1));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(writes[0].url).toBe(`/api/groups/${fixtureId}/missions/${fixtureId}/submissions`);expect(writes[0].body).toMatchObject({body:'오늘의 참여 기록'});expect(writes[0].body.requestId).toEqual(expect.any(String));
});
