import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const run=vi.hoisted(()=>vi.fn());
const retry=vi.hoisted(()=>vi.fn());
const adminPage=vi.hoisted(()=>({data:[] as unknown[]}));
vi.mock('./participation-controls',()=>({ParticipationAdmin:({children,title}:{children:(role:string)=>ReactNode;title:string})=><main><h1>{title}</h1>{children((globalThis as unknown as {adminRole?:string}).adminRole??'admin')}</main>,useAdminPage:()=>({state:{status:'ready',data:adminPage.data,nextCursor:null,moreLoading:false,moreError:false},retry,loadMore:vi.fn()}),AdminListState:()=>null,styles:{}}));
vi.mock('@/features/schedules/ui/participation-ui',()=>({useParticipationAction:()=>({run,busy:false,error:null,idempotencyKey:()=>'44444444-4444-4444-8444-444444444444'}),ActionFeedback:()=>null}));
import {GroupEventApprovals} from './group-event-approvals';
const item={id:'33333333-3333-4333-8333-333333333333',pageId:'22222222-2222-4222-8222-222222222222',pageName:'한강 러닝 모임',title:'11월 정기 러닝',description:'반포에서 출발해요',startsAt:'2026-11-07T01:00:00Z',endsAt:'2026-11-07T03:00:00Z',opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-07T00:00:00Z',location:'반포 한강공원',capacity:30,requiresApproval:false,linkedMissionTitle:null,revision:2,submittedAt:'2026-11-06T00:00:00Z',creatorName:'운영진' as string|null,creatorRole:'manager' as string|null,imageUrl:'/images/avatars/star-pink.webp' as string|null};
afterEach(()=>{cleanup();delete (globalThis as unknown as {adminRole?:string}).adminRole;});
beforeEach(()=>{run.mockReset();retry.mockReset();adminPage.data=[item];run.mockResolvedValue({eventId:item.id,approvalStatus:'approved',approvalReason:null,revision:2});});
it('shows the content an admin must check',()=>{
 render(<GroupEventApprovals locale='ko'/>);
 const row=screen.getByRole('listitem');
 for(const text of ['11월 정기 러닝','한강 러닝 모임','반포 한강공원','30','운영진','반포에서 출발해요'])expect(within(row).getByText(text)).toBeInTheDocument();
});
it('shows the event image under review',()=>{
 const {container}=render(<GroupEventApprovals locale='ko'/>);
 expect(container.querySelector('img')).toHaveAttribute('src',item.imageUrl);
});
it.each([['ko','owner','소유자'],['ko','manager','운영진'],['ko','member','회원'],['ko',null,'회원'],['en','owner','Owner'],['en','manager','Manager'],['en','member','Member'],['en',null,'Member']] as const)('names a nameless requester by role in %s: %s',(locale,creatorRole,label)=>{
 adminPage.data=[{...item,creatorName:null,creatorRole,description:''}];
 render(<GroupEventApprovals locale={locale}/>);
 expect(within(screen.getByRole('listitem')).getByText(label)).toBeInTheDocument();
});
it('approves with the viewed revision and refreshes',async()=>{
 render(<GroupEventApprovals locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'승인'}));
 await waitFor(()=>expect(retry).toHaveBeenCalled());
 expect(run.mock.calls[0][0]).toBe(`/api/groups/admin/pages/${item.pageId}/events/${item.id}/approval`);
 expect(run.mock.calls[0][1]).toBe('PATCH');
 expect(run.mock.calls[0][2]).toMatchObject({action:'approve',expectedRevision:2});
});
it('asks for a reason before rejecting',async()=>{
 render(<GroupEventApprovals locale='ko'/>);
 const reject=screen.getByRole('button',{name:'반려'});
 expect(reject).toBeDisabled();
 fireEvent.change(screen.getByLabelText('반려 사유'),{target:{value:'장소가 불분명합니다'}});
 expect(reject).toBeEnabled();
 fireEvent.click(reject);
 await waitFor(()=>expect(run).toHaveBeenCalled());
 expect(run.mock.calls[0][2]).toMatchObject({action:'reject',reason:'장소가 불분명합니다',expectedRevision:2});
});
it('lets a read-only admin read but not decide',()=>{
 (globalThis as unknown as {adminRole?:string}).adminRole='viewer';
 render(<GroupEventApprovals locale='ko'/>);
 expect(screen.getByRole('button',{name:'승인'})).toBeDisabled();
});
