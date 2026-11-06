import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GroupEventScreen} from './group-event-screen';
import {GroupEventsList} from './group-activities';
import {EventLifecyclePanel} from './event-source-panels';
import {activityFixture,fixtureId} from '../../../e2e/groups-local/activity-fixtures';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:0})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const isDetail=(url:string)=>url.endsWith(`/events/${fixtureId}`);
function serve(state:string|null,patch:{event?:Record<string,unknown>;canManage?:boolean}){
 const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);const value=activityFixture(url,'GET',state) as Record<string,unknown>;if(!isDetail(url))return Response.json(value);return Response.json({...value,event:{...(value.event as object),...patch.event},canManage:patch.canManage??false});}));
 return urls;
}
const render_=()=>render(<GroupEventScreen pageId={fixtureId} eventId={fixtureId} locale='ko'/>);
it('shows staff the waiting state instead of the published label and hides operations',async()=>{
 const urls=serve(null,{event:{approvalStatus:'pending',approvalReason:null},canManage:true});render_();
 expect(await screen.findByText('승인 대기')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'현장 체크인'})).not.toBeInTheDocument();
 expect(screen.queryByLabelText('내 QR 티켓')).not.toBeInTheDocument();
 expect(urls.some(url=>url.includes('/participants'))).toBe(false);
 expect(urls.some(url=>url.includes('/official-application'))).toBe(false);
});
it('shows staff the rejection reason',async()=>{
 serve(null,{event:{approvalStatus:'rejected',approvalReason:'장소가 불분명합니다'},canManage:true});render_();
 expect(await screen.findByText('반려됨')).toBeInTheDocument();
 expect(screen.getByText('반려 사유')).toBeInTheDocument();
 expect(screen.getByText('장소가 불분명합니다')).toBeInTheDocument();
});
it('keeps operations for an approved event',async()=>{
 const urls=serve(null,{event:{approvalStatus:'approved',approvalReason:null},canManage:true});render_();
 expect(await screen.findByRole('button',{name:'현장 체크인'})).toBeInTheDocument();
 expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
 await waitFor(()=>expect(urls.some(url=>url.includes('/participants'))).toBe(true));
});
it('tells a registered member the event is waiting and turns off the venue scan',async()=>{
 serve('confirmed',{event:{approvalStatus:'pending',approvalReason:null,ticketAvailable:false}});render_();
 expect(await screen.findByRole('heading',{name:'승인 대기'})).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'행사'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:/현장 QR 스캔/})).toBeDisabled();
 expect(screen.getByRole('button',{name:/내 QR 티켓 보기/})).toBeDisabled();
});
it('gives a hidden event link a way home instead of a pointless retry',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>isDetail(url)?Response.json({error:{code:'GROUP_ACTIVITY_NOT_FOUND'}},{status:404}):Response.json(activityFixture(url,'GET','pending'))));render_();
 expect(await screen.findByRole('heading',{name:'행사를 찾을 수 없어요'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'다시 시도'})).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:/모임 홈/})).toHaveAttribute('href',expect.stringContaining(`/pages/groups/${fixtureId}`));
});
it('still offers a retry when the request itself failed',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>isDetail(url)?Response.json({error:{code:'GROUP_ACTIVITY_UNAVAILABLE'}},{status:503}):Response.json(activityFixture(url,'GET','pending'))));render_();
 expect(await screen.findByRole('button',{name:'다시 시도'})).toBeInTheDocument();
});
it('marks waiting events in the staff list',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const data=activityFixture(`/api/groups/${fixtureId}/events`,'GET',null) as {events:Record<string,unknown>[]};void url;return Response.json({...data,events:[{...data.events[0],approvalStatus:'pending',approvalReason:null}],nextCursor:null});}));
 render(<GroupEventsList pageId={fixtureId} locale='ko'/>);
 expect(await screen.findByText('승인 대기')).toBeInTheDocument();
});
it('does not call a private draft waiting',()=>{
 vi.stubGlobal('fetch',vi.fn());
 const event=(activityFixture(`/api/groups/${fixtureId}/events`,'GET',null) as {events:Parameters<typeof EventLifecyclePanel>[0]['event'][]}).events[0];
 render(<EventLifecyclePanel pageId={fixtureId} event={{...event,state:'draft',approvalStatus:'pending',approvalReason:null}} locale='ko' onEdit={vi.fn()} onSaved={vi.fn()}/>);
 expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
});
