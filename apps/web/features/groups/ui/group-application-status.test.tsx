import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({items:[] as unknown[],loading:false,error:false,authenticated:true,request:vi.fn()}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({ready:true,authenticated:state.authenticated,ownerKey:'o',request:state.request}),useGroupResource:(_url:string,parse:(value:unknown)=>{items:unknown[];nextCursor:string|null})=>({authenticated:state.authenticated,ready:true,loading:state.loading,error:state.error,ownerKey:'o',retry:vi.fn(),request:state.request,data:state.loading||state.error||!state.authenticated?undefined:parse({items:state.items,nextCursor:null})})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:any)=><main>{children}</main>}));
vi.mock('./group-qualification',()=>({GroupQualificationForm:()=><div data-testid='earlier-form'/>}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
vi.mock('./group-image',()=>({GroupImage:()=>null}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>({items:[],busy:false,ready:true,invalid:false,add:vi.fn(),remove:vi.fn(),retry:vi.fn(),markUsed:vi.fn()})}));
import {GroupApplicationStatusScreen} from './group-application-status-screen';
const id='e9500000-0000-4000-8000-000000000001',page='e9500000-0000-4000-8000-000000000002',asset='e9500000-0000-4000-8000-000000000003';
const row=(over:object)=>({id,kind:'fan',name:'아이유',description:'소개',imageUrl:null,question:null,status:'submitted',reason:null,pageId:null,createdAt:'2026-11-07T00:00:00+00:00',qualification:null,submissionRevision:1,...over});
beforeEach(()=>{state.items=[];state.loading=false;state.error=false;state.authenticated=true;state.request.mockReset();});
afterEach(cleanup);
it.each([['submitted','확인 중'],['reviewing','확인 중'],['changes_requested','보완 요청'],['approved','승인'],['rejected','반려']])('names %s as %s',(status,label)=>{
 state.items=[row({status,reason:status==='rejected'?'계정을 확인하지 못했어요':null})];render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.getByRole('heading',{level:1,name:'내 신청'})).toBeInTheDocument();
 const item=screen.getByRole('article');expect(within(item).getByText('아이유')).toBeInTheDocument();expect(within(item).getByText(label)).toBeInTheDocument();
 if(status==='rejected')expect(within(item).getByText('계정을 확인하지 못했어요')).toBeInTheDocument();
});
it('links an approved application to its page',()=>{
 state.items=[row({status:'approved',pageId:page})];render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.getByRole('link',{name:'페이지 보기'})).toHaveAttribute('href',`/pages/groups/${page}?locale=ko`);
});
it('shows an empty state, a skeleton, an error and a guest login, never a blank page',()=>{
 const {unmount}=render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.getByRole('heading',{name:'아직 보낸 신청이 없어요'})).toBeInTheDocument();unmount();
 state.loading=true;const second=render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(second.container.querySelector('[data-fan-skeleton]')).not.toBeNull();expect(screen.queryByText('불러오는 중')).toBeNull();second.unmount();
 state.loading=false;state.error=true;const third=render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.getByRole('alert')).toBeInTheDocument();third.unmount();
 state.error=false;state.authenticated=false;render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.getByRole('link',{name:'로그인'}).getAttribute('href')).toContain('view%3Dmine');
});
it('resubmits a new-form answer bound to the viewed revision, keeping its link and capture',async()=>{
 state.items=[row({status:'changes_requested',reason:'캡처를 더 올려 주세요',submissionRevision:3,qualification:{hasExistingPage:true,evidenceUrl:'https://cafe.example.test/a',assetIds:[asset]}})];
 state.request.mockResolvedValue({id,status:'submitted',pageId:null});render(<GroupApplicationStatusScreen locale='ko'/>);
 expect(screen.queryByTestId('earlier-form')).toBeNull();
 expect(screen.getByRole('checkbox',{name:'기존에 운영하던 페이지가 있나요?'})).toBeChecked();
 fireEvent.change(screen.getByLabelText('페이지 소개'),{target:{value:'새 소개'}});
 fireEvent.submit(screen.getByLabelText('페이지 소개').closest('form')!);
 await waitFor(()=>expect(state.request).toHaveBeenCalled());
 const [url,init]=state.request.mock.calls[0];expect(url).toBe(`/api/groups/applications/${id}`);expect(init.method).toBe('PATCH');
 expect(JSON.parse(init.body)).toMatchObject({expectedRevision:3,description:'새 소개',qualification:{hasExistingPage:true,evidenceUrl:'https://cafe.example.test/a',assetIds:[asset]}});
});
it('keeps the earlier form for an application saved in the earlier shape',()=>{
 state.items=[row({status:'changes_requested',qualification:{communityName:'Club',evidenceUrl:'https://example.test/a',introduction:'x',assetIds:[]}})];render(<GroupApplicationStatusScreen locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'보완하여 다시 신청'}));
 expect(screen.getByTestId('earlier-form')).toBeInTheDocument();
});
