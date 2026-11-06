import {act,configure,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {clearResources} from "@/components/fan-ui/resource-cache";

import {beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupBenefitsScreen,BenefitsCatalog,BenefitsComingSoon} from './group-benefits-screen';
import {useGroupRequest} from './use-group-resource';
import type {AppLocale} from '@/i18n/locales';
import {groupBenefitsCopy} from './group-benefits-copy';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {rewardedExchangeCopy} from '@/features/group-wallet/ui/rewarded-copy';
import {resetDukjilCatalogCache} from '@/features/dukjil/ui/dukjil-provider';// Blurred sections stay mounted as aria-hidden; their data contracts are still asserted here.
configure({defaultHidden:true});
const adUnit=vi.hoisted(()=>({value:'/123/rewarded' as string|undefined}));
vi.mock('@/features/group-wallet/ui/google-rewarded-ad',()=>({rewardedAdUnit:()=>adUnit.value}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'synthetic-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:any)=><div>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
const wallet={sequence:1,points:137,tickets:7,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}};
const raffle={id,pageId:id,pageName:'Actual page',title:'First raffle',description:'Original description',imageUrl:null,href:`/pages/groups/${id}/raffles/${id}`,status:'open',closesAt:'2100-12-31T00:00:00Z'};
const uid=(n:number)=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const joined=(count:number)=>Array.from({length:count},(_,i)=>({id:uid(i+1),kind:'fan',celebrityId:uid(i+101),slug:`c${i+1}`,name:`Creator ${i+1}`,description:'d',imageUrl:null,question:null,memberCount:1}));
const rankRows=(count:number)=>Array.from({length:count},(_,i)=>({rank:i+1,slug:`r${i+1}`,name:`Ranked ${i+1}`,imageUrl:null,score:100-i,jjinfanCount:i,myHearts:rankMine}));
let fail=false,failCreators=false,empty=false,invalidCursor=false,joinedCount=0,rankCount=0,catalogOn=true,spotlightCount=0,spotlightFails=false,rankMine:number|null=null;
const requests:string[]=[];
beforeEach(()=>{historyFails.value=false;resetDukjilCatalogCache();fail=false;failCreators=false;empty=false;invalidCursor=false;joinedCount=0;rankCount=0;catalogOn=true;spotlightCount=0;spotlightFails=false;rankMine=null;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.startsWith('/api/dukjil/catalog'))return Response.json(catalogOn?{version:1,rules:{checkin:{points:2},post:{points:20},comment:{points:3},share:{points:10}},missionBook:null}:{version:null,rules:{},missionBook:null});
  if(url.startsWith('/api/groups?limit=4&type=fan&sort=today'))return spotlightFails?Response.json({error:{code:'X'}},{status:500}):Response.json({items:joined(spotlightCount).map(page=>({...page,memberCount:1200000})),nextCursor:null});
  if(url.startsWith('/api/groups?mine=joined&limit=50'))return Response.json({items:joined(joinedCount),nextCursor:null});
  if(url.startsWith('/api/me/attendance?creators='))return Response.json({kstDate:'2026-11-06',items:joined(joinedCount).map((page,i)=>({celebrityId:page.celebrityId,attendedToday:i===0,streak:i===0?3:0,nextBonusIn:4,hasPassport:true}))});
  if(url.startsWith('/api/rankings/creators'))return Response.json({period:'week',periodStart:'2026-11-02',computedAt:'2026-11-06T00:00:00Z',rows:rankRows(rankCount)});
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
function LuckyCatalog({locale}:{locale:AppLocale}){const owner=useGroupRequest();return <BenefitsComingSoon locale={locale} grouped><section><BenefitsCatalog key={`raffles:${owner.ownerKey}`} kind='raffles' locale={locale} heading={groupBenefitsCopy(locale).lucky}/></section></BenefitsComingSoon>;}
const renderCatalog=(locale:AppLocale='ko')=>render(<LuckyCatalog locale={locale}/>);
it('shows balances from the validated wallet and only a title and a status badge for 럭키드로우 when no raffle is open',async()=>{
 empty=true;const view=render(<GroupBenefitsScreen locale='ja'/>);
 await screen.findAllByText('137 P');
 await waitFor(()=>expect(requests).toContain('/api/groups/benefits?kind=raffles'));
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ja').lucky});
 expect(within(section).getByRole('heading',{name:groupBenefitsCopy('ja').lucky})).toBeInTheDocument();expect(within(section).getByText(groupBenefitsCopy('ja').soon)).toBeInTheDocument();
 expect(within(section).queryAllByRole('link')).toHaveLength(0);expect(view.container.querySelectorAll('[inert]')).toHaveLength(0);
});
it('uses validated catalog values, real scoped links, zero rewards and independent cursor pages',async()=>{
 renderCatalog('ja');await screen.findByText('First raffle');
 expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.queryByText('Survey')).not.toBeInTheDocument();
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ja').lucky});
 expect(within(section).getAllByRole('link').some(link=>link.getAttribute('href')===`${raffle.href}?locale=ja`)).toBe(true);
 fireEvent.click(within(section).getByRole('button'));
 await screen.findByText('Second raffle');expect(screen.getByText('First raffle')).toBeInTheDocument();
 expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
});
it('distinguishes errors from empty and retries the failing catalog',async()=>{
 fail=true;renderCatalog();await screen.findAllByRole('alert');
 expect(screen.queryByText(groupBenefitsCopy('ko').empty)).not.toBeInTheDocument();
 fail=false;fireEvent.click(within(screen.getAllByRole('alert')[0]).getByRole('button'));await screen.findByText('First raffle');
});
it('shows one alert for a failing catalog and retries it from the alert',async()=>{
 fail=true;renderCatalog();
 await screen.findByRole('alert');
 expect(screen.getAllByRole('alert')).toHaveLength(1);
 expect(screen.queryByText(groupBenefitsCopy('ko').soon)).toBeNull();
 fail=false;requests.length=0;
 fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
 await screen.findByText('First raffle');
 expect(requests.some(url=>url.includes('kind=raffles'))).toBe(true);
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
});
it('does not request private balances for guests',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByRole('link',{name:'로그인'});expect(requests).not.toContain('/api/me/wallet');
 expect(screen.getAllByRole('link',{name:'로그인'}).every(link=>link.getAttribute('href')?.includes('returnTo='))).toBe(true);
 expect(document.querySelector('a[href="#wallet-history"]')).toBeNull();
});
it('hides the exchange action and balances for guests in every language and keeps them for owners',async()=>{
 for(const locale of APP_LOCALES){
  auth.authenticated=false;empty=true;const guest=render(<GroupBenefitsScreen locale={locale}/>);
  await waitFor(()=>expect(screen.queryByRole('button',{name:rewardedExchangeCopy(locale).action})).toBeNull());
  expect(screen.queryByText('137 P')).toBeNull();
  guest.unmount();
 }
 auth.authenticated=true;empty=false;render(<GroupBenefitsScreen locale='ko'/>);
 expect(await screen.findByRole('button',{name:rewardedExchangeCopy('ko').action})).toBeTruthy();
});
it('restarts a catalog whose cursor anchor is no longer available',async()=>{
 renderCatalog();await screen.findByText('First raffle');
 invalidCursor=true;fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');empty=true;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));
 await within(section).findByText(groupBenefitsCopy('ko').empty);
 expect(screen.queryByText('First raffle')).toBeNull();expect(requests).toContain('/api/groups/benefits?kind=raffles');
 expect(requests.some(url=>url.includes('cursor='))).toBe(false);
});
it('keeps the same cursor and accumulated entries on a transient error',async()=>{
 renderCatalog();await screen.findByText('First raffle');fail=true;
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');fail=false;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));await screen.findByText('Second raffle');
 expect(screen.getByText('First raffle')).toBeInTheDocument();expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
});

it('drops accumulated pages immediately when the owner changes',async()=>{
 const view=renderCatalog();await screen.findByText('First raffle');fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByText('Second raffle');
 empty=true;session.ownerId='owner-b';session.generation++;
 view.rerender(<LuckyCatalog locale='ko'/>);expect(screen.queryByText('First raffle')).not.toBeInTheDocument();expect(screen.queryByText('Second raffle')).not.toBeInTheDocument();await screen.findAllByText(groupBenefitsCopy('ko').empty);
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
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText(groupBenefitsCopy('ko').soon);
 expect(screen.queryByText(/P = /)).not.toBeInTheDocument();
 await act(async()=>resolvers.forEach(resolve=>resolve(Response.json({...wallet,pointCost:999}))));
 await screen.findByRole('alert');expect(screen.queryByText(/P = /)).not.toBeInTheDocument();
});

it('retains real raffles and removes point-event requests',async()=>{renderCatalog();await screen.findByText('First raffle');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.getByRole('link',{name:/캡슐/})).toHaveAttribute('href','/my/capsules?locale=ko');expect(screen.getByText(/응모 접수 중/)).toBeInTheDocument();});
it('labels preparing entries and preserves raffle errors',async()=>{const original=globalThis.fetch;let phase='preparing';vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.includes('kind=raffles')?Promise.resolve(phase==='preparing'?Response.json({kind:'raffles',items:[{...raffle,status:'preparing'}],nextCursor:null}):Response.json({error:{code:'UNAVAILABLE'}},{status:503})):original(url,init)));const v=renderCatalog();expect(await screen.findByText(/준비 중/)).toBeInTheDocument();expect(screen.queryByText(/응모 접수 중/)).toBeNull();v.unmount();clearResources();phase='failure';renderCatalog();await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();});

const historyFails=vi.hoisted(()=>({value:false}));
vi.mock('@/features/group-wallet/ui/wallet-screen',async()=>{const {useEffect,useRef}=await import('react');return {WalletHistoryPanel:({preview}:{preview?:{onFailure?:(failed:boolean,retry:()=>void)=>void}})=>{const latest=useRef(preview);useEffect(()=>{latest.current=preview;});useEffect(()=>{if(historyFails.value)latest.current?.onFailure?.(true,()=>{historyFails.value=false;});},[]);return <section><h2 id='wallet-history'>내역</h2></section>;},WalletExchangeDialog:({open,onClose}:{open:boolean;onClose:()=>void})=>open?<div role='dialog' aria-label='응모권 전환'><button onClick={onClose}>전환 닫기</button></div>:null};});


it('shows geometry placeholders only during initial reads and replaces them with real data',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});const original=globalThis.fetch;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{await gate;return original(input,init);}));
 render(<GroupBenefitsScreen locale='ko'/>);const pending=screen.getAllByRole('status');expect(pending.length).toBeGreaterThan(0);expect(pending.some(node=>node.getAttribute('aria-busy')==='true')).toBe(true);expect(screen.queryByText('137 P')).not.toBeInTheDocument();
 await act(async()=>release());await screen.findAllByText('137 P');expect(screen.queryByRole('status',{busy:true})).not.toBeInTheDocument();
});





it('opens only the group ticket conversion from the wallet card, with the rate beside the balances and no selection card',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);const button=await screen.findByRole('button',{name:'광고 보고 교환하기'});
 expect(screen.queryByRole('radio')).toBeNull();expect(document.querySelector('fieldset')).toBeNull();expect(screen.queryByText(/하트/)).toBeNull();
 expect(screen.getByText('100 P').parentElement).toHaveTextContent(/100 P.*1장/);expect(screen.queryByText(/100 P = 1개/)).toBeNull();expect(screen.queryByText(/공식 응모권/)).toBeNull();
 const card=button.closest('section')!;expect(within(card).getByText('137 P')).toBeInTheDocument();expect(within(card).getByText('7장')).toBeInTheDocument();
 fireEvent.click(button);expect(screen.getByRole('dialog',{name:'응모권 전환'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'전환 닫기'}));expect(screen.queryByRole('dialog')).toBeNull();
});
/* A disabled exchange keeps the common grey pill; only enabled primary controls count as emphasis. */
const primaryLabels=()=>[...document.querySelectorAll<HTMLElement>('main a,main button')].filter(el=>!el.closest('[inert]')&&/primary/.test(el.className)&&!(el as HTMLButtonElement).disabled).map(el=>el.textContent);
const withPoints=(points:number)=>{const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));};
const exchangeButton=()=>screen.findByRole('button',{name:'광고 보고 교환하기'});
it('emphasises the exchange, not the check-in, once the points cover the rate (boundary 100 and 101)',async()=>{
 for(const points of [100,101]){
  withPoints(points);joinedCount=2;const view=render(<GroupBenefitsScreen locale='ko'/>);
  const button=await exchangeButton();await screen.findByText('Creator 2');
  expect(button).toBeEnabled();expect(primaryLabels()).toEqual(['광고 보고 교환하기']);
  view.unmount();
 }
});
it('disables the exchange and emphasises the first check-in when the points fall short (99)',async()=>{
 withPoints(99);joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);
 const button=await exchangeButton();await screen.findByText('Creator 2');
 expect(button).toBeDisabled();expect(screen.getByText('100 P').parentElement).toHaveTextContent(/100 P.*1장/);
 await waitFor(()=>expect(primaryLabels()).toEqual(['출석하기']));expect(button.className).toMatch(/primary/);
});
it('has no emphasised action at all when the points fall short and nothing is left to check in',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0})):url.startsWith('/api/me/attendance?creators=')?Promise.resolve(Response.json({kstDate:'2026-11-06',items:joined(2).map(page=>({celebrityId:page.celebrityId,attendedToday:true,streak:1,nextBonusIn:4,hasPassport:true}))})):base(url,init)));
 joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);const button=await exchangeButton();await screen.findByText('Creator 1');
 expect(button).toBeDisabled();expect(primaryLabels()).toEqual([]);
});
it('moves the emphasis from the check-in to the exchange when a check-in brings the points to the rate',async()=>{
 let points=95;const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));
 joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);const button=await exchangeButton();await waitFor(()=>expect(primaryLabels()).toEqual(['출석하기']));
 expect(button).toBeDisabled();
 points=105;await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 await waitFor(()=>expect(primaryLabels()).toEqual(['광고 보고 교환하기']));expect(button).toBeEnabled();
});
it('emphasises the exchange when there is no attendance section (no joined page, guests, policy off) and the points cover the rate',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await exchangeButton();expect(primaryLabels()).toEqual(['광고 보고 교환하기']);
});
it('lists joined pages under 오늘의 덕질 with pending pages first and expands past five rows',async()=>{
 joinedCount=7;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('Creator 2');const section=screen.getByRole('region',{name:'오늘의 덕질'});
 const rows=()=>within(section).getAllByRole('listitem');expect(rows()).toHaveLength(5);
 expect(rows()[0]).toHaveTextContent('Creator 2');expect(within(section).queryByText('Creator 1')).toBeNull();
 fireEvent.click(within(section).getByRole('button',{name:'전체 보기'}));expect(rows()).toHaveLength(7);expect(within(section).getByText('Creator 1')).toBeInTheDocument();
 expect(within(section).queryByRole('button',{name:'전체 보기'})).toBeNull();
});
it('keeps the wallet card for guests: locked balances, the public exchange rate and the one emphasised login',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 const login=await screen.findByRole('link',{name:'로그인'});const card=login.closest('section')!;
 expect(within(card).getAllByRole('img',{name:'로그인 후 확인'})).toHaveLength(2);expect(card.textContent).not.toContain('—');
 expect(within(card).getByText('100 P')).toBeInTheDocument();expect(within(card).getByText('1장')).toBeInTheDocument();
 expect(login.getAttribute('href')).toBe('/login?returnTo=%2Fbenefits%3Flocale%3Dko&locale=ko');expect(login).toHaveAttribute('data-fan-action-emphasis','primary');
 expect(screen.queryByRole('button',{name:'광고 보고 교환하기'})).toBeNull();expect(document.getElementById('wallet-history')).toBeNull();
 expect(document.querySelectorAll('[data-fan-action-emphasis="primary"]')).toHaveLength(1);
});
it('shows guests a locked history block under the same heading with no tabs or links',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:'내역'});expect(within(section).getByRole('heading',{name:'내역'})).toBeInTheDocument();
 expect(section.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);expect(within(section).queryByRole('link')).toBeNull();expect(within(section).queryByText('아직 내역이 없어요')).toBeNull();
});
it('shows guests the spotlight pages as 오늘의 덕질 tiles with a login check-in and the public point policy',async()=>{
 auth.authenticated=false;empty=true;spotlightCount=4;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('Creator 4');const section=screen.getByRole('region',{name:'오늘의 덕질'});
 expect(within(section).getAllByRole('listitem')).toHaveLength(4);expect(within(section).getAllByText('팬 1,200,000')).toHaveLength(4);
 const checkIns=within(section).getAllByRole('link',{name:'출석체크'});expect(checkIns).toHaveLength(4);
 for(const link of checkIns){expect(link).toHaveAttribute('href','/login?returnTo=%2Fbenefits%3Flocale%3Dko&locale=ko');expect(link).not.toHaveAttribute('data-fan-action-emphasis','primary');}
 expect(within(section).getByText('출석 2P · 글쓰기 20P · 댓글 3P · 공유 10P')).toBeInTheDocument();
 expect(within(section).getByRole('link',{name:'덕질하는 법 보기'})).toHaveAttribute('href','/guide/dukjil?locale=ko');
 expect(requests.some(url=>url.includes('/api/me/'))).toBe(false);
});
it('keeps 오늘의 덕질 for guests with an explore action when no page is spotlighted, and a local error when the list fails',async()=>{
 auth.authenticated=false;empty=true;const first=render(<GroupBenefitsScreen locale='ko'/>);
 const explore=await screen.findByRole('link',{name:'페이지 둘러보기'});const section=screen.getByRole('region',{name:'오늘의 덕질'});
 expect(explore).toHaveAttribute('href','/pages/groups?locale=ko');expect(within(section).queryAllByRole('listitem')).toHaveLength(0);
 first.unmount();clearResources();spotlightFails=true;render(<GroupBenefitsScreen locale='ko'/>);
 const alert=await screen.findByText('출석 정보를 불러오지 못했어요');const failed=screen.getByRole('region',{name:'오늘의 덕질'});
 expect(screen.getAllByRole('link',{name:'로그인'}).length).toBeGreaterThan(0);spotlightFails=false;spotlightCount=2;fireEvent.click(within(failed).getByRole('button',{name:'다시 시도'}));await screen.findByText('Creator 2');
});
it('locks the my-hearts cell in guest ranking rows and keeps real values for owners',async()=>{
 auth.authenticated=false;empty=true;rankCount=5;const guest=render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:'랭킹'});await within(section).findByText('Ranked 5');
 expect(section.querySelectorAll('[data-mine-lock]')).toHaveLength(2);expect(within(section).getAllByRole('img',{name:'로그인 후 확인'})).toHaveLength(2);
 expect(requests.some(url=>url.includes('/api/me/'))).toBe(false);guest.unmount();
 auth.authenticated=true;empty=false;rankMine=30;render(<GroupBenefitsScreen locale='ko'/>);
 const owner=await screen.findByRole('region',{name:'랭킹'});await within(owner).findByText('Ranked 5');expect(owner.querySelectorAll('[data-mine-lock]')).toHaveLength(0);expect(within(owner).getAllByText('내 하트 30개')).toHaveLength(2);
});
it('renders the guest card, tiles and locked cells in every language without a dash or a second emphasised action',async()=>{
 for(const locale of APP_LOCALES){
  auth.authenticated=false;empty=true;spotlightCount=3;rankCount=2;const view=render(<GroupBenefitsScreen locale={locale}/>);
  const w=walletCopy(locale);await screen.findByText('Creator 3');await screen.findAllByText('Ranked 2');
  const login=screen.getAllByRole('link',{name:w.login}).find(link=>link.getAttribute('href')?.startsWith('/login'))!;
  expect(login.getAttribute('href')).toContain(`locale=${locale}`);expect(login.getAttribute('href')).toContain(encodeURIComponent(`/benefits?locale=${locale}`));
  expect(document.querySelectorAll('[data-fan-action-emphasis="primary"]')).toHaveLength(1);
  expect(document.querySelectorAll('[role="img"][aria-label]').length).toBeGreaterThanOrEqual(4);
  expect(view.container.textContent).not.toContain('— P');
  view.unmount();
 }
});
it('collapses the expanded attendance list from the same title-row control',async()=>{
 joinedCount=7;render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('Creator 2');const section=screen.getByRole('region',{name:'오늘의 덕질'});
 fireEvent.click(within(section).getByRole('button',{name:'전체 보기'}));expect(within(section).getAllByRole('listitem')).toHaveLength(7);
 fireEvent.click(within(section).getByRole('button',{name:'접기'}));expect(within(section).getAllByRole('listitem')).toHaveLength(5);expect(within(section).getByRole('button',{name:'전체 보기'})).toHaveAttribute('aria-expanded','false');
});
it('shows one combined alert with one retry when the wallet, attendance, ranking and history all fail',async()=>{
 const base=fetch;let broken=true;historyFails.value=true;
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>broken&&(url==='/api/me/wallet'||url.startsWith('/api/groups?mine=joined')||url.startsWith('/api/rankings'))?Promise.resolve(Response.json({error:{code:'X'}},{status:500})):base(url,init)));
 joinedCount=2;rankCount=2;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('요청을 완료하지 못했어요',{},{timeout:5000});
 await waitFor(()=>{const visible=screen.getAllByRole('alert',{hidden:false});expect(visible).toHaveLength(1);expect(visible[0]).toHaveTextContent('요청을 완료하지 못했어요');expect(screen.queryByRole('region',{name:'오늘의 덕질',hidden:false})).toBeNull();expect(screen.queryByRole('region',{name:'랭킹',hidden:false})).toBeNull();expect(screen.queryByRole('region',{name:groupBenefitsCopy('ko').lucky,hidden:false})).toBeNull();expect(document.getElementById('wallet-history')?.closest('[hidden]')).not.toBeNull();},{timeout:5000});
 broken=false;fireEvent.click(within(screen.getAllByRole('alert',{hidden:false})[0]).getByRole('button'));
 await screen.findByText('Ranked 2',{},{timeout:5000});await screen.findByText('Creator 2',{},{timeout:5000});await waitFor(()=>expect(screen.queryAllByRole('alert',{hidden:false})).toHaveLength(0),{timeout:5000});
},15000);
it('shows the empty state with a way to explore pages when no page is joined',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('가입한 페이지가 없어요');const section=screen.getByRole('region',{name:'오늘의 덕질'});
expect(within(section).getByRole('link',{name:'페이지 둘러보기'})).toHaveAttribute('href','/pages/groups?locale=ko');
});
it('hides 오늘의 덕질 while the attendance policy is off',async()=>{
 catalogOn=false;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137 P');
 await waitFor(()=>expect(screen.queryByRole('region',{name:'오늘의 덕질'})).toBeNull());expect(requests.some(url=>url.includes('/api/me/attendance'))).toBe(false);
});
it('shows the top five weekly creators with one link to the full ranking and no title-row links',async()=>{
 rankCount=9;render(<GroupBenefitsScreen locale='ko'/>);const section=await screen.findByRole('region',{name:'랭킹'});await within(section).findByText('Ranked 5');
 expect(within(section).queryByText('Ranked 6')).toBeNull();expect(within(section).getAllByRole('listitem')).toHaveLength(5);
 expect(within(section).getByRole('link',{name:'전체 보기'})).toHaveAttribute('href','/rankings?locale=ko');
 expect(requests).toContain('/api/rankings/creators?period=week&locale=ko');
 expect(document.querySelector('a[href="#wallet-history"]')).toBeNull();expect(screen.getAllByRole('link').filter(link=>link.getAttribute('href')==='/rankings?locale=ko')).toHaveLength(1);
});
it('keeps a ranking failure local with its own retry',async()=>{
 const base=fetch;let broken=true;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.startsWith('/api/rankings')&&broken?Promise.resolve(Response.json({error:{code:'X'}},{status:500})):base(url,init)));
 rankCount=2;render(<GroupBenefitsScreen locale='ko'/>);const section=await screen.findByRole('region',{name:'랭킹'});const alert=await within(section).findByRole('alert');
 broken=false;fireEvent.click(within(alert).getByRole('button'));await within(section).findByText('Ranked 2');
});
it('does not offer a conversion the balance cannot cover',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);expect(await screen.findByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();
});
it('shows 럭키드로우 as a clear title with one status badge, never a blurred or inert preview, in every locale',async()=>{
 empty=true;const view=render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137 P');
 expect(screen.getAllByText('곧 안내해 드릴게요').length).toBe(1);expect(view.container.querySelectorAll('[inert],[aria-hidden=true] img')).toHaveLength(0);
 expect(screen.queryByText(/하트/)).toBeNull();
 for(const locale of APP_LOCALES)expect(groupBenefitsCopy(locale).soon.trim()).not.toBe('');
});
it('keeps conversion closed with a notice until an ad unit is configured',async()=>{
 adUnit.value=undefined;empty=true;render(<GroupBenefitsScreen locale='ko'/>);const off=await screen.findByRole('button',{name:'광고 보고 교환하기'});expect(off).not.toBeDisabled();expect(screen.queryByText(/광고 준비 중/)).toBeNull();expect(screen.getAllByText('곧 안내해 드릴게요').length).toBe(1);adUnit.value='/123/rewarded';
});
const openRaffle=(n:number,extra:object={})=>({...raffle,id:uid(n+200),title:`Prize ${n}`,status:'open',...extra});
function serveRaffles(answer:()=>Response){const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.startsWith('/api/groups/benefits')?Promise.resolve(answer()):base(url,init)));}
it('draws a prize card per open raffle with its title, page, state, deadline, link and image, and no status line',async()=>{
 serveRaffles(()=>Response.json({kind:'raffles',items:[openRaffle(1,{imageUrl:'https://cdn.test/prize.png'})],nextCursor:null}));
 render(<GroupBenefitsScreen locale='ko'/>);const section=await screen.findByRole('region',{name:'럭키드로우'});const card=await within(section).findByRole('link',{name:/Prize 1/});
 expect(card).toHaveAttribute('href',`${raffle.href}?locale=ko`);expect(card).toHaveTextContent(raffle.pageName);expect(card).toHaveTextContent('응모 접수 중');expect(card).toHaveTextContent('마감');
 expect(card.querySelector('img[data-fallback]')).toBeNull();expect(within(section).getByRole('heading',{name:'럭키드로우'})).toBeInTheDocument();
 expect(within(section).queryByText('곧 안내해 드릴게요')).toBeNull();expect(within(section).queryByRole('button')).toBeNull();
});
it('uses the ticket picture for a raffle without an image and invents no prize',async()=>{
 serveRaffles(()=>Response.json({kind:'raffles',items:[openRaffle(1,{imageUrl:null})],nextCursor:null}));
 render(<GroupBenefitsScreen locale='ko'/>);const card=await screen.findByRole('link',{name:/Prize 1/});
 expect(card.querySelector('img[data-fallback]')).toHaveAttribute('src','/images/economy/ticket.svg');
});
it('keeps the one line when only preparing raffles exist',async()=>{
 serveRaffles(()=>Response.json({kind:'raffles',items:[openRaffle(1,{status:'preparing'})],nextCursor:null}));
 render(<GroupBenefitsScreen locale='ko'/>);await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/groups/benefits?kind=raffles',expect.anything()));await screen.findAllByText('137 P');
 expect(screen.queryByRole('link',{name:/Prize 1/})).toBeNull();expect(screen.getAllByText('곧 안내해 드릴게요')).toHaveLength(1);
});
it('shows two prize cards and expands to the rest from three open raffles',async()=>{
 serveRaffles(()=>Response.json({kind:'raffles',items:[openRaffle(1),openRaffle(2),openRaffle(3)],nextCursor:null}));
 render(<GroupBenefitsScreen locale='ko'/>);const section=await screen.findByRole('region',{name:'럭키드로우'});await within(section).findByRole('link',{name:/Prize 1/});
 expect(within(section).getAllByRole('link')).toHaveLength(2);fireEvent.click(within(section).getByRole('button',{name:'전체 보기'}));
 expect(within(section).getAllByRole('link')).toHaveLength(3);expect(within(section).getByRole('button',{name:'접기'})).toHaveAttribute('aria-expanded','true');
});
it('falls back to the one line when the raffle list fails and stays out of the failure alert',async()=>{
 serveRaffles(()=>Response.json({error:{code:'X'}},{status:503}));
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137 P');await waitFor(()=>expect(fetch).toHaveBeenCalledWith('/api/groups/benefits?kind=raffles',expect.anything()));
 expect(screen.getAllByText('곧 안내해 드릴게요')).toHaveLength(1);expect(screen.queryByRole('alert')).toBeNull();
});
it('still offers guests the open raffles',async()=>{
 auth.authenticated=false;serveRaffles(()=>Response.json({kind:'raffles',items:[openRaffle(1)],nextCursor:null}));
 render(<GroupBenefitsScreen locale='en'/>);expect(await screen.findByRole('link',{name:/Prize 1/})).toHaveAttribute('href',`${raffle.href}?locale=en`);
});
