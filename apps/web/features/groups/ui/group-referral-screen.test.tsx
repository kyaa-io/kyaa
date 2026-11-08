import type {ReactNode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {GroupReferralScreen} from './group-referral-screen';
import {APP_LOCALES} from '@/i18n/locales';
import {groupReferralCopy,inviteRedeemFailure} from './group-referral-copy';
const toast=vi.hoisted(()=>vi.fn(()=>'t'));
vi.mock('@/components/fan-ui/fan-toast',()=>({showFanToast:toast}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,ownerKey:'owner:1'}));const getAccessToken=vi.hoisted(()=>vi.fn(async()=>'token'));
const id='10000000-0000-4000-8000-000000000001';
const history={registeredCount:3,pendingCount:1,qualifiedCount:1,history:[{id,state:'pending_fan_verification',registeredAt:'2026-11-01T00:00:00Z',resolvedAt:null},{id:'10000000-0000-4000-8000-000000000002',state:'qualified_reward_issued',registeredAt:'2026-11-01T00:00:00Z',resolvedAt:'2026-11-02T00:00:00Z'},{id:'10000000-0000-4000-8000-000000000003',state:'registration_cancelled',registeredAt:'2026-11-01T00:00:00Z',resolvedAt:'2026-11-02T00:00:00Z'}]};
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({getAccessToken})}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>auth,useGroupResource:()=>({data:{items:[{id,kind:'fan',celebrityId:id,slug:'nchive',name:'엔카이브 팬페이지',description:'',imageUrl:null,question:null,memberCount:12}],nextCursor:null},error:false,retry:vi.fn()})}));
const proto=HTMLDialogElement.prototype,show=Object.getOwnPropertyDescriptor(proto,'showModal'),close=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(show)Object.defineProperty(proto,'showModal',show);else Reflect.deleteProperty(proto,'showModal');if(close)Object.defineProperty(proto,'close',close);else Reflect.deleteProperty(proto,'close');});
beforeEach(()=>{auth.ready=true;auth.authenticated=true;auth.ownerKey='owner:1';getAccessToken.mockClear();toast.mockClear();});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function requests(){const writes:{path:string;body:unknown;headers:Record<string,string>}[]=[];vi.stubGlobal('fetch',vi.fn(async(path:string,input:RequestInit)=>{writes.push({path,body:JSON.parse(input.body as string),headers:input.headers as Record<string,string>});return Response.json(path.endsWith('/invite-code')?{code:'ABC123',redeemed:false,redemptionState:'none'}:path.endsWith('/redeem-invite')?{state:'registered_pending_fan_verification'}:history);}));return writes;}
it('renders only owner-returned anonymous history and copies a real code with a selected destination',async()=>{
 const writes=requests(),copy=vi.fn(async(_text:string)=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<GroupReferralScreen locale='ko'/>);
 expect(await screen.findByText('초대 1 · 조건 확인 중')).toBeInTheDocument();expect(screen.getByText('초대 2 · 조건 확인 완료')).toBeInTheDocument();expect(screen.getByText('초대 3 · 등록 취소')).toBeInTheDocument();expect(document.body.textContent).not.toContain(id);
 fireEvent.click(screen.getByRole('button',{name:'친구초대'}));const dialog=await screen.findByRole('dialog',{name:'친구초대'}),link=within(dialog).getByRole('textbox',{name:'내 초대 링크'});await waitFor(()=>expect((link as HTMLInputElement).value).toContain('code=ABC123'));fireEvent.change(within(dialog).getByRole('combobox'),{target:{value:'/nchive?locale=ko'}});fireEvent.click(within(dialog).getByRole('button',{name:'초대 링크 복사'}));await waitFor(()=>expect(copy).toHaveBeenCalledOnce());const copied=new URL(copy.mock.calls[0][0]);expect(copied.pathname).toBe('/my/invitations');expect(copied.searchParams.get('code')).toBe('ABC123');expect(copied.searchParams.get('destination')).toBe('/nchive?locale=ko');expect(writes.map(w=>w.path)).toEqual(['/api/community-stamps/invitation-overview','/api/community-stamps/invite-code']);expect(writes.every(w=>JSON.stringify(w.body)==='{}'&&w.headers.Authorization==='Bearer token')).toBe(true);
});
it('uses the existing redemption contract and keeps qualification pending after registration',async()=>{
 const writes=requests();render(<GroupReferralScreen locale='ko' code='abc123' destination='/nchive?locale=ko'/>);fireEvent.click(await screen.findByRole('button',{name:'초대 코드 등록'}));expect(await screen.findByText('초대 코드가 등록됐어요. · 조건 확인 중')).toBeInTheDocument();expect(writes.find(w=>w.path.endsWith('redeem-invite'))?.body).toEqual({code:'ABC123'});expect(screen.getByRole('link',{name:'초대받은 페이지로 이동'})).toHaveAttribute('href','/nchive?locale=ko');
});
it('preserves the invitation through login without calling an owned API as a guest',()=>{
 auth.authenticated=false;const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<GroupReferralScreen locale='ko' code='ABC123' destination='/nchive'/>);const url=new URL(screen.getByRole('link',{name:'로그인'}).getAttribute('href')!,'https://local.test');const target=new URL(url.searchParams.get('returnTo')!,'https://local.test');expect(target.searchParams.get('code')).toBe('ABC123');expect(target.searchParams.get('destination')).toBe('/nchive');expect(fetch).not.toHaveBeenCalled();
});
it('provides complete nonempty labels for every supported locale',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupReferralCopy(locale)).every(Boolean)).toBe(true);});

it('retries a failed owner history request without substituting empty success data',async()=>{let failed=true;vi.stubGlobal('fetch',vi.fn(async()=>failed?Response.json({error:{code:'COMMUNITY_STAMP_UNAVAILABLE'}},{status:503}):Response.json({registeredCount:0,pendingCount:0,qualifiedCount:0,history:[]})));render(<GroupReferralScreen locale='ko'/>);await screen.findByRole('alert');expect(screen.queryByText('아직 초대 내역이 없어요.')).toBeNull();failed=false;fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));expect(await screen.findByText('아직 초대 내역이 없어요.')).toBeInTheDocument();});
it('retains the link and destination when clipboard permission fails, then retries copying',async()=>{requests();const copy=vi.fn(async(_text:string)=>{}).mockRejectedValueOnce(new Error('denied'));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<GroupReferralScreen locale='ko' initialInvite/>);const dialog=await screen.findByRole('dialog'),field=within(dialog).getByRole('textbox',{name:'내 초대 링크'});await waitFor(()=>expect((field as HTMLInputElement).value).toContain('ABC123'));const target=within(dialog).getByRole('combobox');fireEvent.change(target,{target:{value:'/nchive?locale=ko'}});fireEvent.click(within(dialog).getByRole('button',{name:'초대 링크 복사'}));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'초대 링크를 복사하지 못했어요.',tone:'error'})));expect(target).toHaveValue('/nchive?locale=ko');expect((field as HTMLInputElement).value).toContain('ABC123');
 const failed=(toast.mock.calls as unknown as [{action:{onClick:()=>void}}][])[0][0];failed.action.onClick();await waitFor(()=>expect(copy).toHaveBeenCalledTimes(2));expect(new URL(copy.mock.calls[1][0]).searchParams.get('destination')).toBe('/nchive?locale=ko');await waitFor(()=>expect(toast).toHaveBeenLastCalledWith({title:'초대 링크를 복사했어요.',tone:'success'}));});
it('clears the prior owner history immediately when the authenticated account changes',async()=>{requests();const view=render(<GroupReferralScreen locale='ko'/>);await screen.findByText('초대 1 · 조건 확인 중');auth.authenticated=false;auth.ownerKey='guest:2';view.rerender(<GroupReferralScreen locale='ko'/>);expect(screen.queryByText('초대 1 · 조건 확인 중')).toBeNull();expect(screen.getByRole('link',{name:'로그인'})).toBeInTheDocument();});

// 261107-2 D9: the copy result is the shared toast, not a line inside the dialog.
it('says the link was copied in the shared toast and keeps the dialog free of the result line',async()=>{
 requests();const copy=vi.fn(async(_text:string)=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<GroupReferralScreen locale='ko' initialInvite/>);
 const dialog=await screen.findByRole('dialog',{name:'친구초대'});await waitFor(()=>expect(within(dialog).getByRole('button',{name:'초대 링크 복사'})).toBeEnabled());fireEvent.click(within(dialog).getByRole('button',{name:'초대 링크 복사'}));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith({title:'초대 링크를 복사했어요.',tone:'success'}));expect(within(dialog).queryByText('초대 링크를 복사했어요.')).toBeNull();
});
// 261107-2 D10: each refusal the server names gets its own line (reproduced locally: own code → SELF_INVITE, existing relation → ALREADY_REDEEMED, unknown code → UNAVAILABLE).
it.each([
 ['COMMUNITY_STAMP_SELF_INVITE',400,'내 초대 코드는 등록할 수 없어요.'],
 ['COMMUNITY_STAMP_ALREADY_REDEEMED',409,'이미 초대 관계가 있는 계정이라 등록할 수 없어요.'],
 ['COMMUNITY_STAMP_INVITE_INELIGIBLE',409,'패스포트를 이미 받은 계정은 초대 코드를 등록할 수 없어요.'],
 ['COMMUNITY_STAMP_UNAVAILABLE',503,'초대 코드를 찾지 못했어요. 친구에게 링크를 다시 받아 주세요.'],
 ['SOMETHING_ELSE',500,'초대 코드를 등록하지 못했어요. 다시 시도해 주세요.'],
])('explains a %s refusal instead of the general error',async(code,status,line)=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.endsWith('/redeem-invite')?Response.json({error:{code}},{status}):Response.json(history)));
 render(<GroupReferralScreen locale='ko' code='abc123'/>);fireEvent.click(await screen.findByRole('button',{name:'초대 코드 등록'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(line);expect(screen.queryByText('요청을 완료하지 못했어요. 다시 시도해 주세요.')).toBeNull();
});
it('has every refusal line in every locale',()=>{for(const locale of APP_LOCALES)for(const code of ['COMMUNITY_STAMP_SELF_INVITE','COMMUNITY_STAMP_ALREADY_REDEEMED','COMMUNITY_STAMP_INVITE_INELIGIBLE','COMMUNITY_STAMP_WALLET_NOT_READY','COMMUNITY_STAMP_UNAVAILABLE','x'])expect(inviteRedeemFailure(locale,code)).toBeTruthy();});
