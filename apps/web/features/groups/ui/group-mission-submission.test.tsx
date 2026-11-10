import '@testing-library/jest-dom/vitest';
import type {ReactNode} from 'react';
import {render,screen,within,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
const navigation=vi.hoisted(()=>({push:vi.fn(),search:'locale=ko&keep=1'}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:navigation.push}),useSearchParams:()=>new URLSearchParams(navigation.search)}));
import {GroupMissionScreen} from './group-mission-screen';
const id='10000000-0000-4000-8000-000000000001';
const request=vi.hoisted(()=>vi.fn(async(_url:string,_input?:RequestInit)=>({})));
const state=vi.hoisted(()=>({survey:false,noSubmission:false,canReview:false,missionPoints:100,status:'pending',body:'  직접 만든 응원 메시지\n원문 설명  ',rewardPoints:0,canSubmit:false,error:false,owner:'first:1',history:[] as unknown[],urls:[] as (string|null)[]}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('./group-activity-header',()=>({GroupActivityHeader:()=>null}));
vi.mock('./group-image',()=>({GroupImage:(props:Record<string,unknown>)=><img alt='' {...props}/> }));
vi.mock('./activity-evidence-task',()=>({ActivityEvidenceTask:({initial,onSubmit}:{initial:{body:string};onSubmit:(input:Record<string,unknown>)=>Promise<boolean>})=><section aria-label='사진 보완 폼'><textarea aria-label='사진 설명' defaultValue={initial.body}/><button onClick={()=>void onSubmit({body:initial.body,originalAttested:true})}>테스트 제출</button></section>}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({request:vi.fn(),ready:true,ownerKey:state.owner}),GroupRequestError:class extends Error{},useGroupResource:(url:string|null)=>{state.urls.push(url);if(url?.endsWith('/submissions'))return {ownerKey:state.owner,retry:vi.fn(),data:{items:[{id,body:'운영진 검토 대상',nickname:'다른 회원',status:'pending',currentRevision:1,history:[]}],nextCursor:null}};return {ownerKey:state.owner,authenticated:true,request,retry:vi.fn(),loading:false,error:state.error,data:state.error||!url?undefined:{mission:{id,title:'실제 응원 미션',instructions:'참여 조건',imageUrl:null,submissionKind:state.survey?'survey':'photo',state:'published',revision:1,rewardPoints:state.missionPoints,status:state.status,actionHref:''},submission:state.noSubmission?null:{id,body:state.body,status:state.status,reason:state.status==='rejected'?'사진 설명을 보완해 주세요.':null,rewardPoints:state.rewardPoints,currentRevision:1,history:state.history,imageUrl:null},canSubmit:state.canSubmit,canReview:state.canReview}};}}));
beforeEach(()=>{state.survey=false;state.status='pending';state.body='  직접 만든 응원 메시지\n원문 설명  ';state.rewardPoints=0;state.canSubmit=false;state.error=false;state.owner='first:1';state.history=[];state.urls=[];state.noSubmission=false;state.canReview=false;state.missionPoints=100;request.mockReset().mockResolvedValue({});navigation.push.mockReset();});
it('shows the exact current body even with only one submission and no older history',()=>{
 render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);const section=screen.getByRole('region',{name:'인증 제출 내역'});expect(section.querySelector('[data-current-submission-body]')?.textContent).toBe(state.body);expect(within(section).getByText('검토 중')).toBeInTheDocument();expect(within(section).getByText('아직 적립되지 않았어요.')).toBeInTheDocument();expect(screen.queryByText('제출 이력')).toBeNull();expect(screen.queryByRole('button',{name:'내용 보완하기'})).toBeNull();expect(state.urls).toContain(`/api/groups/${id}/missions/${id}`);expect(state.urls.some(url=>url?.endsWith('/submissions'))).toBe(false);
});
it('links the owned submission to this group earnings without carrying mission query state',()=>{
 render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);
 expect(screen.getByRole('link',{name:'적립 내역 확인'})).toHaveAttribute('href',`/pages/groups/${id}/earnings?locale=ko`);
});
it('explains an existing survey response on revisit without inventing a fresh success',()=>{
 state.survey=true;state.canSubmit=false;
 const view=render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);
 expect(screen.getByText('같은 설문에 응답한 기록이 있어요.')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'내 제출 내역'})).toHaveAttribute('href',`/pages/groups/${id}/missions/${id}?locale=ko&keep=1&view=submission`);
 expect(screen.queryByText('응답을 제출했어요.')).toBeNull();
 state.noSubmission=true;view.rerender(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);
 expect(screen.queryByText('같은 설문에 응답한 기록이 있어요.')).toBeNull();
});
it('shows only actual completed reward points and no resubmit action',()=>{
 state.status='completed';state.rewardPoints=37;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);const section=screen.getByRole('region',{name:'인증 제출 내역'});expect(within(section).getByText('37 P')).toBeInTheDocument();expect(within(section).queryByText('100 P')).toBeNull();expect(within(section).queryByText('아직 적립되지 않았어요.')).toBeNull();expect(screen.queryByRole('button',{name:'내용 보완하기'})).toBeNull();
});
it('keeps rejected body and reason above the permission-gated prefilled revision form',()=>{
 state.status='rejected';state.canSubmit=true;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(screen.getByText('사진 설명을 보완해 주세요.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'내용 보완하기'}));expect(screen.getByRole('textbox',{name:'사진 설명'})).toHaveValue(state.body);
});
it('does not offer editing when API denies resubmission, and never retains the old body on resource failure',()=>{
 state.status='rejected';state.canSubmit=false;const view=render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(screen.queryByRole('button',{name:'내용 보완하기'})).toBeNull();state.owner='next:2';state.error=true;view.rerender(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(document.querySelector('[data-current-submission-body]')).toBeNull();expect(screen.getByRole('alert')).toBeInTheDocument();
});
it('keeps previous revisions separate from the current body',()=>{
 state.history=[{revision:1,body:'以前原文',status:'rejected',reason:'보완',createdAt:'2026-11-01T00:00:00Z',imageUrl:null,surveyResponse:null},{revision:2,body:state.body,status:'pending',reason:null,createdAt:'2026-11-02T00:00:00Z',imageUrl:null,surveyResponse:null}];render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(document.querySelector('[data-current-submission-body]')?.textContent).toBe(state.body);expect(screen.getByText('제출 이력').closest('details')).toBeInTheDocument();
});

it('keeps requirements accessible after submission and switches views without a different mission',()=>{
 const view=render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);expect(screen.getByText('참여 조건')).toBeInTheDocument();expect(screen.queryByRole('region',{name:'인증 제출 내역'})).toBeNull();expect(screen.getByRole('link',{name:'내 제출 내역'})).toHaveAttribute('href',`/pages/groups/${id}/missions/${id}?locale=ko&keep=1&view=submission`);view.rerender(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(screen.getByRole('region',{name:'인증 제출 내역'})).toBeInTheDocument();expect(screen.getByRole('link',{name:'덕질 참여 조건'})).toHaveAttribute('href',`/pages/groups/${id}/missions/${id}?locale=ko&keep=1&view=conditions`);view.rerender(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='conditions'/>);expect(screen.getByText('참여 조건')).toBeInTheDocument();
});

it('falls back to requirements if the explicit submission view has no owned submission',()=>{state.noSubmission=true;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);expect(screen.getByText('참여 조건')).toBeInTheDocument();expect(screen.queryByRole('region',{name:'인증 제출 내역'})).toBeNull();});
it('navigates only after an acknowledged own submission POST',async()=>{state.status='rejected';state.canSubmit=true;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);fireEvent.click(screen.getByRole('button',{name:'내용 보완하기'}));fireEvent.click(screen.getByRole('button',{name:'테스트 제출'}));await waitFor(()=>expect(navigation.push).toHaveBeenCalledWith(`/pages/groups/${id}/missions/${id}?locale=ko&keep=1&view=submission`,{scroll:false}));expect(request.mock.calls[0]?.[0]).toBe(`/api/groups/${id}/missions/${id}/submissions`);});
it('keeps manager review PATCH in the current view',async()=>{state.canReview=true;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);expect(request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'완료'}));await waitFor(()=>expect(request).toHaveBeenCalled());expect(request.mock.calls[0]?.[1]?.method).toBe('PATCH');expect(navigation.push).not.toHaveBeenCalled();});

it('reuses the own submission request ID after failure and clears it only after success',async()=>{
 state.status='rejected';state.canSubmit=true;request.mockRejectedValueOnce(new Error('offline'));
 render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);
 fireEvent.click(screen.getByRole('button',{name:'내용 보완하기'}));
 expect(request).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'테스트 제출'}));await screen.findByRole('alert');
 const first=JSON.parse(String(request.mock.calls[0]?.[1]?.body));
 expect(first).toMatchObject({body:state.body,originalAttested:true,expectedMissionRevision:1,expectedSubmissionRevision:1,requestId:expect.any(String)});
 expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
 fireEvent.click(screen.getByRole('button',{name:'테스트 제출'}));await waitFor(()=>expect(navigation.push).toHaveBeenCalledTimes(1));
 expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual(first);
 fireEvent.click(screen.getByRole('button',{name:'테스트 제출'}));await waitFor(()=>expect(navigation.push).toHaveBeenCalledTimes(2));
 expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body)).requestId).not.toBe(first.requestId);
});

it('keeps manager rejection input and request IDs on retry, disables review while busy, and changes IDs for changed input',async()=>{
 state.canReview=true;
 let rejectRequest!:(error:Error)=>void;
 request.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectRequest=reject;})).mockRejectedValueOnce(new Error('still offline'));
 render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);
 const reason=screen.getByRole('textbox');const reject=screen.getByRole('button',{name:'반려'});const approve=screen.getByRole('button',{name:'완료'});
 expect(reject).toBeDisabled();expect(request).not.toHaveBeenCalled();
 fireEvent.change(reason,{target:{value:'  원문 사유  '}});fireEvent.click(reject);
 expect(reason).toBeDisabled();expect(reject).toBeDisabled();expect(approve).toBeDisabled();
 fireEvent.click(approve);expect(request).toHaveBeenCalledTimes(1);
 rejectRequest(new Error('offline'));await screen.findByRole('alert');
 expect(reason).toHaveValue('  원문 사유  ');expect(reason).toBeEnabled();
 const first=JSON.parse(String(request.mock.calls[0]?.[1]?.body));
 expect(request.mock.calls[0]?.[0]).toBe(`/api/groups/${id}/missions/${id}/submissions/${id}`);
 expect(first).toMatchObject({action:'reject',reason:'  원문 사유  ',expectedSubmissionRevision:1,requestId:expect.any(String)});
 fireEvent.click(reject);await waitFor(()=>expect(reject).toBeEnabled());
 expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual(first);
 fireEvent.change(reason,{target:{value:'수정한 사유'}});fireEvent.click(reject);await waitFor(()=>expect(reject).toBeEnabled());
 const changed=JSON.parse(String(request.mock.calls[2]?.[1]?.body));expect(changed.reason).toBe('수정한 사유');expect(changed.requestId).not.toBe(first.requestId);
 expect(request.mock.calls.map(([,input])=>input?.method)).toEqual(['PATCH','PATCH','PATCH']);expect(navigation.push).not.toHaveBeenCalled();
});

it('does not navigate on an unsuccessful own submission POST',async()=>{state.status='rejected';state.canSubmit=true;request.mockRejectedValueOnce(new Error('offline'));render(<GroupMissionScreen pageId={id} missionId={id} locale='ko' view='submission'/>);fireEvent.click(screen.getByRole('button',{name:'내용 보완하기'}));fireEvent.click(screen.getByRole('button',{name:'테스트 제출'}));await screen.findByRole('alert');expect(navigation.push).not.toHaveBeenCalled();expect(screen.getByRole('textbox',{name:'사진 설명'})).toHaveValue(state.body);});

it('renders M01 hierarchy with actual zero points and no internal memo copy, never sample rewards',()=>{state.noSubmission=true;state.missionPoints=0;state.canSubmit=true;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);expect(screen.getByRole('heading',{name:'덕질 참여 조건'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'참여 전에 확인해 주세요'})).toBeInTheDocument();expect(screen.getByText('실제 응원 미션')).toBeInTheDocument();for(const label of['참여 대상','제출할 내용','포인트와 인정 횟수','지급 시점'])expect(screen.getByText(label)).toBeInTheDocument();expect(screen.getByText('0 P',{exact:true})).toBeInTheDocument();expect(screen.queryByText(/미확정|확인 필요|Unconfirmed/)).not.toBeInTheDocument();expect(screen.getByText('참여 인정 및 검토 후 지급')).toBeInTheDocument();expect(screen.getByRole('button',{name:'인증 제출하기'})).toBeEnabled();expect(screen.getByRole('button',{name:'내 제출 내역'})).toBeDisabled();});
it('keeps submitted M01 requirements readable while API blocks another submission',()=>{state.canSubmit=false;render(<GroupMissionScreen pageId={id} missionId={id} locale='ko'/>);expect(screen.getByText('참여 조건')).toBeInTheDocument();expect(screen.getByRole('button',{name:'인증 제출하기'})).toBeDisabled();expect(screen.getByRole('link',{name:'내 제출 내역'})).toHaveAttribute('href',`/pages/groups/${id}/missions/${id}?locale=ko&keep=1&view=submission`);expect(request).not.toHaveBeenCalled();});
