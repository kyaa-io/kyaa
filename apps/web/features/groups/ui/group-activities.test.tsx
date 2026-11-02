import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { GroupEventScreen } from './group-event-screen';
import { GroupEventsList,GroupCollections } from './group-activities';
import { eventParticipationCopy, eventActionCopy } from './event-participation-copy';
import { activitiesCopy } from './activities-copy';
import { APP_LOCALES } from '@/i18n/locales';
import { activityFixture,fixtureId } from '../../../e2e/groups-local/activity-fixtures';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:0})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
it('has complete activity labels in every supported language',()=>{for(const locale of APP_LOCALES){expect(Object.values(activitiesCopy(locale)).every(Boolean)).toBe(true);expect(eventParticipationCopy[locale]).toHaveLength(2);expect(eventActionCopy[locale]).toHaveLength(10);}});
it('keeps pending applications separate from confirmed QR tickets',async()=>{
 const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(activityFixture(url,'GET','pending'));}));
 render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 await screen.findByRole('heading',{name:'한강 러닝 크루 정기 모임'});
 expect(urls.some(url=>url.endsWith('/ticket'))).toBe(false);expect(screen.queryByRole('img',{name:activitiesCopy('ko').ticket})).not.toBeInTheDocument();
});
it('loads later event cards with a cursor without dropping the first page',async()=>{
 const second='e9200000-0000-4000-8000-000000000002';const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);const data=activityFixture(`/api/groups/${fixtureId}/events`,'GET',null) as {events:Record<string,unknown>[]};return Response.json({events:url.includes('cursor=')?[{...data.events[0],id:second,title:'두 번째 행사'}]:data.events,canManage:false,nextCursor:url.includes('cursor=')?null:fixtureId});}));
 render(<GroupEventsList pageId={fixtureId} locale='ko'/>);await screen.findByText('한강 러닝 크루 정기 모임');fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByText('두 번째 행사');expect(screen.getByText('한강 러닝 크루 정기 모임')).toBeInTheDocument();expect(urls.some(url=>url.includes(`cursor=${fixtureId}`))).toBe(true);
});
it('preserves the collection destination query and hash',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(activityFixture(`/api/groups/${fixtureId}/collections`,'GET',null))));render(<GroupCollections pageId={fixtureId} locale='ko'/>);
 await waitFor(()=>expect(screen.getByRole('link',{name:activitiesCopy('ko').buy})).toHaveAttribute('href','https://kyaa.io/?utm_source=fixture#collection'));
});
it('keeps confirmed attendance separate from manual check-in and requires a reason',async()=>{
 const {GroupEventOperations}=await import('./group-event-operations');const writes:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(input?.method==='POST'){writes.push(JSON.parse(input.body as string));return Response.json({status:'checked_in',registrationId:fixtureId,checkedInAt:'2026-11-07T09:00:00Z',alreadyCheckedIn:false,replayed:false});}if(url.includes('/participants'))return Response.json({items:[{id:fixtureId,appUserId:fixtureId,nickname:'하늘',avatarUrl:null,status:'confirmed',checkedInAt:null}],nextCursor:null});return Response.json(url.endsWith('/support')?{attendanceCount:0,reviewCount:0,items:[],nextCursor:null}:{items:[],nextCursor:null});}));
 render(<GroupEventOperations pageId={fixtureId} eventId={fixtureId} locale='ko' refresh={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'수동 체크인'}));expect(writes).toHaveLength(0);fireEvent.change(screen.getByRole('textbox',{name:'확인한 참가자 이름'}),{target:{value:'하늘'}});fireEvent.change(screen.getByRole('textbox',{name:'QR 확인 불가 사유'}),{target:{value:'휴대전화 배터리 소진'}});fireEvent.click(screen.getAllByRole('button',{name:'수동 체크인'}).at(-1)!);await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({confirmedName:'하늘',reason:'휴대전화 배터리 소진'});
});
it('resubmits support materials with the original record without changing its evidence',async()=>{
 const {GroupEventOperations}=await import('./group-event-operations');const writes:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(input?.method==='POST'){writes.push(JSON.parse(input.body as string));return Response.json({id:fixtureId});}if(url.includes('/participants'))return Response.json({items:[],nextCursor:null});if(url.endsWith('/support'))return Response.json({attendanceCount:12,reviewCount:5,items:[{id:fixtureId,eventId:fixtureId,revision:1,reviewedAt:null,previousSubmissionId:null,description:'체크인 및 후기 내역',sourceUrl:'https://example.com/evidence?keep=1#reviews',status:'changes_requested',reason:'누락된 후기를 연결해 주세요.',createdAt:'2026-11-07T09:00:00Z'}],nextCursor:null});return Response.json({items:[],nextCursor:null});}));
 render(<GroupEventOperations pageId={fixtureId} eventId={fixtureId} locale='ko' refresh={()=>{}}/>);await screen.findByText('누락된 후기를 연결해 주세요.');fireEvent.click(screen.getByRole('button',{name:'보완 요청'}));expect(screen.getAllByRole('textbox',{name:'내용'}).some(input=>(input as HTMLTextAreaElement).value==='체크인 및 후기 내역')).toBe(true);const inputs=screen.getAllByRole('textbox');const source=inputs.find(input=>(input as HTMLInputElement).value.startsWith('https://example.com'));expect(source).toHaveValue('https://example.com/evidence?keep=1#reviews');fireEvent.submit(source!.closest('form')!);await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({previousSubmissionId:fixtureId,description:'체크인 및 후기 내역',sourceUrl:'https://example.com/evidence?keep=1#reviews'});
});

it('loads a confirmed ticket only when the participant opens it',async()=>{
 const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(activityFixture(url,'GET','confirmed'));}));
 render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);const button=await screen.findByRole('button',{name:'내 QR 티켓 보기'});expect(urls.some(url=>url.endsWith('/ticket'))).toBe(false);expect(button).toHaveAttribute('aria-expanded','false');fireEvent.click(button);await waitFor(()=>expect(urls.some(url=>url.endsWith('/ticket'))).toBe(true));expect(button).toHaveAttribute('aria-expanded','true');
});

it('keeps the review editor closed until an eligible participant chooses to write',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','review'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 fireEvent.click(await screen.findByRole('button',{name:'후기 쓰기'}));expect(await screen.findByRole('textbox',{name:'후기 쓰기'})).toBeInTheDocument();
});
it('shows the three actions but prevents unavailable participation actions',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(activityFixture(url,'GET','pending'))));render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
 expect(await screen.findByRole('button',{name:'내 QR 티켓 보기'})).toBeDisabled();expect(screen.getByRole('button',{name:'현장 QR 스캔'})).toBeDisabled();expect(screen.getByRole('button',{name:'후기 쓰기'})).toBeDisabled();
});
