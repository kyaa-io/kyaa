import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
const run=vi.hoisted(()=>vi.fn());
const resources=vi.hoisted(()=>({users:[] as unknown[],bindings:[] as unknown[]}));
vi.mock('./participation-controls',()=>({ParticipationAdmin:({children}:{children:(role:string)=>ReactNode})=><main>{children((globalThis as unknown as {adminRole?:string}).adminRole??'admin')}</main>,useAdminPage:()=>({state:{status:'ready',data:[{id:'22222222-2222-4222-8222-222222222222',name:'엘리나'}]}}),AdminListState:()=>null,styles:{}}));
vi.mock('@/features/schedules/ui/participation-ui',()=>({useParticipationAction:()=>({run,busy:false,error:'',idempotencyKey:()=>'44444444-4444-4444-8444-444444444444'}),ActionFeedback:()=>null}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupResource:(url:string|null)=>url?.includes('/api/admin/fans')?{data:{items:resources.users},retry:vi.fn()}:url?{data:{items:resources.bindings},retry:vi.fn()}:{retry:vi.fn()}}));
import {GroupArtistManager} from './group-artist-manager';
const fan={fanId:'33333333-3333-4333-8333-333333333333',nickname:'엘리나 본계정',email:'artist@example.com',accountStatus:'active'};
beforeEach(()=>{run.mockReset();run.mockResolvedValue({updated:true});resources.users=[fan];resources.bindings=[];});
afterEach(()=>{cleanup();delete (globalThis as unknown as {adminRole?:string}).adminRole;});
const find=()=>{fireEvent.change(screen.getByLabelText('아티스트 이메일 또는 닉네임'),{target:{value:'artist@example.com'}});fireEvent.click(screen.getByRole('button',{name:'계정 확인'}));};
it('goes from email to account, page, grant and result on one form',async()=>{
 render(<GroupArtistManager locale='ko'/>);
 expect(screen.queryByLabelText('팬페이지')).toBeNull();
 find();
 expect(screen.getByRole('radio',{name:'엘리나 본계정 · artist@example.com'})).toBeChecked();
 fireEvent.change(screen.getByLabelText('팬페이지'),{target:{value:'22222222-2222-4222-8222-222222222222'}});
 expect(screen.getByRole('button',{name:'아티스트로 연결'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'아티스트로 연결'}));
 await waitFor(()=>expect(run).toHaveBeenCalledOnce());
 expect(run.mock.calls[0][2]).toMatchObject({appUserId:fan.fanId});
 expect(await screen.findByText('연결했어요: 엘리나 본계정 → 엘리나')).toBeInTheDocument();
});
it('says when no account matches and offers no grant',()=>{
 resources.users=[];render(<GroupArtistManager locale='ko'/>);find();
 expect(screen.getByText('일치하는 계정이 없어요.')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'아티스트로 연결'})).toBeNull();
});
it('makes the admin pick when a nickname matches several accounts',()=>{
 resources.users=[fan,{...fan,fanId:'55555555-5555-4555-8555-555555555555',email:null}];render(<GroupArtistManager locale='ko'/>);find();
 expect(screen.getAllByRole('radio')).toHaveLength(2);
 expect(screen.queryByLabelText('팬페이지')).toBeNull();
});
it('lets a viewer look up but not grant',()=>{
 (globalThis as unknown as {adminRole?:string}).adminRole='viewer';render(<GroupArtistManager locale='ko'/>);find();
 expect(screen.getByRole('radio')).toBeDisabled();
 expect(screen.getByRole('button',{name:'아티스트로 연결'})).toBeDisabled();
});
