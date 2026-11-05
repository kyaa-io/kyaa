import {act,configure,fireEvent,render,screen,within} from '@testing-library/react';

import {beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupBenefitsScreen} from './group-benefits-screen';
import {groupBenefitsCopy} from './group-benefits-copy';// Blurred sections stay mounted as aria-hidden; their data contracts are still asserted here.
configure({defaultHidden:true});
const adUnit=vi.hoisted(()=>({value:'/123/rewarded' as string|undefined}));
vi.mock('@/features/group-wallet/ui/google-rewarded-ad',()=>({rewardedAdUnit:()=>adUnit.value}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'synthetic-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:any)=><div>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
const wallet={sequence:1,points:137,hearts:3,tickets:7,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}};
const raffle={id,pageId:id,pageName:'Actual page',title:'First raffle',description:'Original description',imageUrl:null,href:`/pages/groups/${id}/raffles/${id}`,status:'open',closesAt:'2100-12-31T00:00:00Z'};
let fail=false,failCreators=false,empty=false,invalidCursor=false;
const requests:string[]=[];
beforeEach(()=>{fail=false;failCreators=false;empty=false;invalidCursor=false;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.includes('/api/public/celebrities')&&failCreators)return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
  if(url.includes('/api/public/celebrities'))return Response.json({celebrities:[{slug:'synthetic-creator',name:'Actual creator'}]});
  const q=new URL(url,'https://local.test').searchParams,kind=q.get('kind');
  if(invalidCursor&&q.has('cursor'))return Response.json({error:{code:'GROUP_BENEFITS_NOT_FOUND'}},{status:404});
  if(fail)return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
  if(empty)return Response.json({kind,items:[],nextCursor:null});
  if(kind==='missions')return Response.json({kind,items:[{id,pageId:id,pageName:'Actual page',title:'Survey',description:'Original question',imageUrl:null,href:`/pages/groups/${id}/missions/${id}`,status:'published',submissionKind:'survey',rewardPoints:0}],nextCursor:null});
  return Response.json({kind,items:[q.has('cursor')?{...raffle,id:second,title:'Second raffle'}:raffle],nextCursor:q.has('cursor')?null:id});
 }));
});
it('uses validated wallet/catalog values, real scoped links, zero rewards and independent cursor pages',async()=>{
 render(<GroupBenefitsScreen locale='ja'/>);
 await screen.findAllByText('137 P');await screen.findByText('First raffle');
 expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.queryByText('Survey')).not.toBeInTheDocument();
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ja').lucky});
 expect(within(section).getAllByRole('link').some(link=>link.getAttribute('href')===`${raffle.href}?locale=ja`)).toBe(true);
 fireEvent.click(within(section).getByRole('button'));
 await screen.findByText('Second raffle');expect(screen.getByText('First raffle')).toBeInTheDocument();
 expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
 expect(screen.getByRole('link',{name:'ハートを送る'})).toHaveAttribute('href','/my/wallet?view=support&creator=synthetic-creator&locale=ja');
});
it('distinguishes errors from empty and retries the failing catalog',async()=>{
 fail=true;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByRole('alert');
 expect(screen.queryByText(groupBenefitsCopy('ko').empty)).not.toBeInTheDocument();
 fail=false;fireEvent.click(within(screen.getAllByRole('alert')[0]).getByRole('button'));await screen.findByText('First raffle');
});
it('shows one alert for failures with the same message and retries every failed request from it',async()=>{
 fail=true;failCreators=true;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByRole('alert');
 expect(screen.getAllByRole('alert')).toHaveLength(1);
 expect(screen.queryByText(groupBenefitsCopy('ko').soon)).toBeNull();
 fail=false;failCreators=false;requests.length=0;
 fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
 await screen.findByText('First raffle');
 expect(requests.some(url=>url.includes('/api/public/celebrities'))).toBe(true);
 expect(requests.some(url=>url.includes('kind=raffles'))).toBe(true);
 expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps received raffles and the notice when only the support request fails',async()=>{
 failCreators=true;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByRole('alert');await screen.findByText('First raffle');
 expect(screen.getAllByRole('alert')).toHaveLength(1);
 expect(screen.getByText(groupBenefitsCopy('ko').soon)).toBeInTheDocument();
});
it('does not request private balances for guests',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText(groupBenefitsCopy('ko').empty);expect(requests).not.toContain('/api/me/wallet');
 expect(screen.getAllByRole('link',{name:'로그인'}).every(link=>link.getAttribute('href')?.includes('returnTo='))).toBe(true);
});
it('restarts a catalog whose cursor anchor is no longer available',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');
 invalidCursor=true;fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');empty=true;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));
 await within(section).findByText(groupBenefitsCopy('ko').empty);
 expect(screen.queryByText('First raffle')).toBeNull();expect(requests).toContain('/api/groups/benefits?kind=raffles');
 expect(requests.some(url=>url.includes('cursor='))).toBe(false);
});
it('keeps the same cursor and accumulated entries on a transient error',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');fail=true;
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');fail=false;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));await screen.findByText('Second raffle');
 expect(screen.getByText('First raffle')).toBeInTheDocument();expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
});

it('drops accumulated pages immediately when the owner changes',async()=>{
 const view=render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByText('Second raffle');
 empty=true;session.ownerId='owner-b';session.generation++;
 view.rerender(<GroupBenefitsScreen locale='ko'/>);expect(screen.queryByText('First raffle')).not.toBeInTheDocument();expect(screen.queryByText('Second raffle')).not.toBeInTheDocument();await screen.findAllByText(groupBenefitsCopy('ko').empty);
});
it('refreshes balances after the shared wallet mutation event',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137 P');requests.length=0;
 await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 expect(requests).toContain('/api/me/wallet');
});
it('has complete localized interface labels',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupBenefitsCopy(locale)).every(value=>value.trim())).toBe(true);});

it('does not invent a rate while wallet loading or invalid',async()=>{
 const original=globalThis.fetch;const resolvers:((value:Response)=>void)[]=[];
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?new Promise<Response>(done=>{resolvers.push(done);}):original(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');
 expect(screen.queryByText(/P = /)).not.toBeInTheDocument();
 await act(async()=>resolvers.forEach(resolve=>resolve(Response.json({...wallet,pointCost:999}))));
 await screen.findByRole('alert');expect(screen.queryByText(/P = /)).not.toBeInTheDocument();
});

it('retains real raffles and removes point-event requests',async()=>{render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.getByRole('link',{name:/캡슐/})).toHaveAttribute('href','/my/capsules?locale=ko');expect(screen.getByText(/응모 접수 중/)).toBeInTheDocument();});
it('labels preparing entries and preserves raffle errors',async()=>{const original=globalThis.fetch;let phase='preparing';vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.includes('kind=raffles')?Promise.resolve(phase==='preparing'?Response.json({kind:'raffles',items:[{...raffle,status:'preparing'}],nextCursor:null}):Response.json({error:{code:'UNAVAILABLE'}},{status:503})):original(url,init)));const v=render(<GroupBenefitsScreen locale='ko'/>);expect(await screen.findByText(/준비 중/)).toBeInTheDocument();expect(screen.queryByText(/응모 접수 중/)).toBeNull();v.unmount();phase='failure';render(<GroupBenefitsScreen locale='ko'/>);await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();});

vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletExchangeDialog:({open,onClose}:{open:boolean;onClose:()=>void})=>open?<div role='dialog' aria-label='응모권 전환'><button onClick={onClose}>전환 닫기</button></div>:null,WalletSupportDialog:({creatorSlug,onClose,initialUnits}:{creatorSlug:string;onClose:()=>void;initialUnits?:number})=><div role='dialog' aria-label='응원'><span>{creatorSlug} {initialUnits}</span><button onClick={onClose}>응원 닫기</button></div>}));


it('shows geometry placeholders only during initial reads and replaces them with real data',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});const original=globalThis.fetch;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{await gate;return original(input,init);}));
 render(<GroupBenefitsScreen locale='ko'/>);const pending=screen.getAllByRole('status');expect(pending.length).toBeGreaterThan(0);expect(pending.some(node=>node.getAttribute('aria-busy')==='true')).toBe(true);expect(screen.queryByText('137 P')).not.toBeInTheDocument();
 await act(async()=>release());await screen.findAllByText('137 P');await screen.findByText('First raffle');expect(screen.queryByRole('status',{busy:true})).not.toBeInTheDocument();
});

it('keeps support disabled for zero or insufficient hearts without a write',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,hearts:0})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);const input=await screen.findByRole('spinbutton',{hidden:true});const link=screen.getByRole('link',{name:'하트 보내기',hidden:true});expect(link).toHaveAttribute('aria-disabled','true');fireEvent.click(link);expect(screen.queryByRole('dialog')).toBeNull();fireEvent.change(input,{target:{value:'2'}});expect(link).toHaveAttribute('aria-disabled','true');fireEvent.click(link);expect(screen.queryByRole('dialog')).toBeNull();
});

it('prevents an amount above the current wallet balance from opening support',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);const input=await screen.findByRole('spinbutton',{hidden:true});fireEvent.change(input,{target:{value:'4'}});const link=screen.getByRole('link',{name:'하트 보내기',hidden:true});expect(link).toHaveAttribute('aria-disabled','true');fireEvent.click(link);expect(screen.queryByRole('dialog')).toBeNull();expect(requests.every(path=>!path.includes('/support'))).toBe(true);
});


it('bounds the single support slider to wallet hearts and disables it for zero or one',async()=>{
 const base=fetch;let hearts=3;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,hearts})):base(url,init)));
 const view=render(<GroupBenefitsScreen locale='ko'/>);let slider=await screen.findByRole('slider',{name:'보낼 하트',hidden:true});expect(slider).toHaveAttribute('max','3');expect(slider).not.toBeDisabled();expect(screen.getAllByRole('slider',{hidden:true})).toHaveLength(1);fireEvent.change(screen.getByRole('spinbutton',{hidden:true}),{target:{value:'2'}});expect(slider).toHaveValue('2');view.unmount();hearts=1;const one=render(<GroupBenefitsScreen locale='ko'/>);slider=await screen.findByRole('slider',{name:'보낼 하트',hidden:true});expect(slider).toHaveAttribute('aria-disabled','true');expect(slider).toHaveAttribute('aria-valuemax','1');expect(screen.getByRole('spinbutton',{hidden:true})).toHaveValue(1);one.unmount();hearts=0;render(<GroupBenefitsScreen locale='ko'/>);slider=await screen.findByRole('slider',{name:'보낼 하트',hidden:true});expect(slider).toHaveAttribute('aria-disabled','true');expect(slider).toHaveAttribute('aria-valuemax','0');expect(screen.getByRole('spinbutton',{hidden:true})).toBeDisabled();expect(screen.getByRole('spinbutton',{hidden:true})).toHaveValue(0);
});

it('opens only the group ticket conversion and shows its policy rate',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);const ticket=await screen.findByRole('radio',{name:'모임 응모권'});expect(ticket).toBeChecked();expect(screen.getByRole('radio',{name:/하트/})).toBeDisabled();expect(screen.getByText('100 P').parentElement).toHaveTextContent(/100 P.*1장/);expect(screen.queryByText(/100 P = 1개/)).toBeNull();expect(screen.queryByText(/공식 응모권/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));expect(screen.getByRole('dialog',{name:'응모권 전환'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'전환 닫기'}));expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not offer a conversion the balance cannot cover',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);expect(await screen.findByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();
});
it('keeps support and lucky draws visible but unusable with a notice in every locale',async()=>{
 const view=render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');expect(screen.getAllByText('곧 안내해 드릴게요').length).toBe(1);
 expect(view.container.querySelectorAll('[inert]')).toHaveLength(1);expect(screen.queryByRole('link',{name:'하트 보내기',hidden:false})).toBeNull();expect(screen.queryByRole('link',{name:/First raffle/,hidden:false})).toBeNull();
 for(const locale of APP_LOCALES)expect(groupBenefitsCopy(locale).soon.trim()).not.toBe('');
});
it('keeps conversion closed with a notice until an ad unit is configured',async()=>{
 adUnit.value=undefined;render(<GroupBenefitsScreen locale='ko'/>);const off=await screen.findByRole('button',{name:'광고 보고 교환하기'});expect(off).toBeDisabled();expect(off.parentElement).toHaveTextContent('광고 준비 중이라 아직 교환할 수 없어요');expect(screen.getAllByText('곧 안내해 드릴게요').length).toBe(1);adUnit.value='/123/rewarded';
});
