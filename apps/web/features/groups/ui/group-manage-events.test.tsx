import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupManagement} from './group-management';
import {GroupPageMenu} from './group-page-menu';
import {GroupEventsList} from './group-activities';
import {activityFixture,fixtureId} from '../../../e2e/groups-local/activity-fixtures';
import type {GroupDetail} from '../domain/contracts';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/'}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:0})}));
const detail={page:{id:fixtureId,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'',imageUrl:null,question:null,anonymous:false,memberCount:1},membership:{role:'owner',joinedAt:'2026-11-03T00:00:00Z'},bookmarked:false} as unknown as GroupDetail;
const base=(activityFixture(`/api/groups/${fixtureId}/events`,'GET',null) as {events:Record<string,unknown>[]}).events[0];
let stored:Record<string,unknown>[]=[];let posts:Record<string,unknown>[]=[];let release:(()=>void)|null=null;let hold=false;let failNext=false;
beforeEach(()=>{stored=[];posts=[];release=null;hold=false;failNext=false;vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
 if(init?.method==='POST'&&url.endsWith('/events')){const body=JSON.parse(String(init.body));posts.push(body);if(failNext){failNext=false;return Response.json({error:{code:'GROUP_ACTIVITY_UNAVAILABLE'}},{status:503});}if(hold)await new Promise<void>(done=>{release=done;});const event={...base,id:`e9200000-0000-4000-8000-00000000000${posts.length}`,title:body.title,state:body.state,approvalStatus:'pending',approvalReason:null};stored.push(event);return Response.json({event});}
 if(url.includes('/events'))return Response.json({events:stored,canManage:true,nextCursor:null});
 if(url.endsWith('/notifications'))return Response.json({enabled:true,noticeEnabled:true,eventEnabled:true,recipientEnabled:true,activityEnabled:true});
 return Response.json({missions:[],canManage:true,nextCursor:null});
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function fill(view:ReturnType<typeof render>,title='11월 정기 러닝'){
 const form=view.container.querySelector('form')!;const set=(name:string,value:string)=>fireEvent.change(form.querySelector(`[name="${name}"]`)!,{target:{value}});
 set('title',title);set('location','반포');set('startsAt','2027-01-10T10:00');set('endsAt','2027-01-10T12:00');set('opensAt','2027-01-01T10:00');set('closesAt','2027-01-09T10:00');set('state','published');
 return form;
}
const manage=()=>{const view=render(<GroupManagement detail={detail} locale='ko' refresh={vi.fn()} section='events'/>);fireEvent.click(screen.getByRole('button',{name:'행사 만들기'}));return view;};
beforeEach(()=>window.history.replaceState(null,'','/manage?section=events'));
it('shows the list and the button first, and opens the form in the same place',async()=>{
 stored=[{...base,title:'기존 행사'}];
 const view=render(<GroupManagement detail={detail} locale='ko' refresh={vi.fn()} section='events'/>);
 expect(await screen.findByText('기존 행사')).toBeInTheDocument();expect(view.container.querySelector('form')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'행사 만들기'}));
 expect(view.container.querySelector('form')).toBeInTheDocument();expect(screen.queryByText('기존 행사')).toBeNull();expect(window.location.search).toContain('new=1');
});
it('tells the owner the result, closes the form and lists the waiting event',async()=>{
 const view=manage();const form=fill(view);fireEvent.submit(form);
 const notice=await screen.findByText('저장했어요.');expect(notice.closest('[role=status]')).toBeInTheDocument();
 const status=notice.closest('[role=status]') as HTMLElement;expect(within(status).getByText('승인 대기')).toBeInTheDocument();
 expect(within(status).getByRole('link',{name:'11월 정기 러닝'})).toHaveAttribute('href',expect.stringContaining('/events/e9200000-0000-4000-8000-000000000001'));
 await waitFor(()=>expect(view.container.querySelector('[name="title"]')).toBeNull());
 const list=view.container.querySelector('#group-event-list') as HTMLElement;
 await within(list).findByText('11월 정기 러닝');expect(within(list).getByText('승인 대기')).toBeInTheDocument();
});
it('sends one request when the save is pressed twice while it is running',async()=>{
 hold=true;const view=manage();const form=fill(view);fireEvent.submit(form);fireEvent.submit(form);
 await waitFor(()=>expect(posts).toHaveLength(1));
 expect(view.container.querySelector('button[type=submit]')).toBeDisabled();
 release?.();await screen.findByText('저장했어요.');expect(posts).toHaveLength(1);
});
it('keeps the input and the same request id for a retry when saving fails',async()=>{
 const view=manage();const form=fill(view);
 failNext=true;fireEvent.submit(form);await screen.findByRole('alert');
 expect((view.container.querySelector('[name="title"]') as HTMLInputElement).value).toBe('11월 정기 러닝');
 expect(screen.queryByText('저장했어요.')).not.toBeInTheDocument();
 fireEvent.submit(view.container.querySelector('form')!);await screen.findByText('저장했어요.');
 expect(posts).toHaveLength(2);expect(posts[1].requestId).toBe(posts[0].requestId);
});
it('shows the rejection reason in the staff list',async()=>{
 stored=[{...base,approvalStatus:'rejected',approvalReason:'장소가 불분명합니다'}];
 render(<GroupEventsList pageId={fixtureId} locale='ko'/>);
 expect(await screen.findByText('반려됨')).toBeInTheDocument();
 expect(screen.getByText('장소가 불분명합니다')).toBeInTheDocument();
});
it('marks a private draft in the staff list instead of waiting',async()=>{
 stored=[{...base,state:'draft',approvalStatus:'pending',approvalReason:null}];
 render(<GroupEventsList pageId={fixtureId} locale='ko'/>);
 expect(await screen.findByText('임시 저장')).toBeInTheDocument();
 expect(screen.queryByText('승인 대기')).not.toBeInTheDocument();
});
it('links staff to the event list from the page menu, and members not',async()=>{
 const view=render(<GroupPageMenu detail={detail} locale='ko' refresh={vi.fn()}/>);
 expect(await screen.findByRole('link',{name:'행사'})).toHaveAttribute('href',expect.stringMatching(/\/manage\?locale=ko&section=events#group-event-list$/));
 view.unmount();
 render(<GroupPageMenu detail={{...detail,membership:{role:'member',joinedAt:'2026-11-03T00:00:00Z'}} as GroupDetail} locale='ko' refresh={vi.fn()}/>);
 expect(screen.queryByRole('link',{name:'행사'})).not.toBeInTheDocument();
});
