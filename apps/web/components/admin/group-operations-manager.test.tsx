import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GroupOperationsManager } from './group-operations-manager';
const id='10000000-0000-4000-8000-000000000001';
const state=vi.hoisted(()=>({role:'admin',items:[] as unknown[],run:vi.fn(),retry:vi.fn(),evidenceUrl:null as string|null}));
vi.mock('./participation-controls',()=>({ParticipationAdmin:({children}:{children:(role:string)=>ReactNode})=>children(state.role),useAdminPage:()=>({state:{status:'ready',data:state.items,nextCursor:null},retry:state.retry}),AdminListState:()=>null,styles:{}}));
vi.mock('@/features/groups/ui/use-group-resource',()=>({useGroupResource:(url:string|null)=>{state.evidenceUrl=url;return {loading:false,error:false,data:{title:'신고 게시물',body:'검토할 내용',removed:false,attachments:[]}};}}));
vi.mock('@/features/schedules/ui/participation-ui',()=>({useParticipationAction:()=>({busy:false,error:null,run:state.run,idempotencyKey:()=>id}),ActionFeedback:()=>null}));
beforeEach(()=>{state.role='admin';state.items=[];state.run.mockReset().mockResolvedValue({updated:true});state.retry.mockReset();state.evidenceUrl=null;});
it('loads private report evidence only when opened and submits the explicit removal decision',async()=>{
 state.items=[{id,page_id:id,target_id:id,targetPostId:id,targetRoomId:null,target_type:'post',reason:'신고 사유',status:'submitted',resolution:null}];
 render(<GroupOperationsManager locale='ko' view='reports'/>);expect(state.evidenceUrl).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'신고된 콘텐츠 확인'}));expect(state.evidenceUrl).toBe(`/api/groups/admin/pages/${id}/reports/${id}`);expect(screen.getByText('검토할 내용')).toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:'처리 내용'}),{target:{value:'반복 광고 확인'}});fireEvent.click(screen.getByRole('checkbox',{name:'신고된 콘텐츠 숨기기'}));fireEvent.submit(screen.getByRole('button',{name:'저장'}).closest('form')!);
 await waitFor(()=>expect(state.run).toHaveBeenCalledWith(`/api/groups/admin/pages/${id}/reports/${id}`,'PATCH',expect.objectContaining({remove:true,resolution:'반복 광고 확인',requestId:id}),expect.any(Function)));
});
it('prevents viewers from changing reward budgets',()=>{
 state.role='viewer';state.items=[{id,pageId:id,pageName:'모임',title:'미션',rewardPoints:10,budgetPoints:1000,submissionCount:0}];
 render(<GroupOperationsManager locale='ko' view='missions'/>);expect(screen.getByRole('spinbutton',{name:'총 지급 한도 (P)'})).toHaveValue(1000);expect(screen.getByRole('button',{name:'보상 설정 저장'})).toBeDisabled();
});
it('locks reward policy after the first submission',()=>{
 state.items=[{id,pageId:id,pageName:'모임',title:'미션',rewardPoints:10,budgetPoints:1000,submissionCount:1}];render(<GroupOperationsManager locale='ko' view='missions'/>);expect(screen.getByRole('spinbutton',{name:'1회 완료 보상 (P)'})).toBeDisabled();
});

it('reviews event support separately from official approval and requires correction notes',async()=>{
 state.items=[{id,page_id:id,event_id:id,event_title:'행사',page_name:'모임',description:'지원 자료',source_url:null,status:'submitted',reason:null,attendanceCount:8,reviewCount:3}];
 render(<GroupOperationsManager locale='ko' view='event-support'/>);
 expect(screen.getByText('실제 참석')).toBeInTheDocument();
 expect(screen.queryByRole('option',{name:'반려'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'검토 결과'}),{target:{value:'request_changes'}});
 const notes=screen.getByRole('textbox',{name:'검토 의견'});expect(notes).toBeRequired();fireEvent.change(notes,{target:{value:'영수증 보완'}});
 fireEvent.submit(screen.getByRole('button',{name:'저장'}).closest('form')!);
 await waitFor(()=>expect(state.run).toHaveBeenCalledWith(`/api/groups/admin/pages/${id}/events/${id}/support/${id}`,'PATCH',expect.objectContaining({action:'request_changes',reason:'영수증 보완',requestId:id}),expect.any(Function)));
});
