import {act,configure,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {clearResources} from "@/components/fan-ui/resource-cache";

import {beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupBenefitsScreen} from './group-benefits-screen';
import {BenefitsCatalog,BenefitsComingSoon} from './group-benefits-legacy';
import {useGroupRequest} from './use-group-resource';
import type {AppLocale} from '@/i18n/locales';
import {groupBenefitsCopy} from './group-benefits-copy';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {rewardedExchangeCopy} from '@/features/group-wallet/ui/rewarded-copy';
import {resetDukjilCatalogCache} from '@/features/dukjil/ui/dukjil-provider';// Blurred sections stay mounted as aria-hidden; their data contracts are still asserted here.
configure({defaultHidden:true});
const adUnit=vi.hoisted(()=>({value:'/123/rewarded' as string|undefined}));
vi.mock('@/features/group-wallet/ui/google-rewarded-ad',()=>({rewardedAdUnit:()=>adUnit.value}));
const bias=vi.hoisted(()=>({value:{status:'error',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}} as any}));
vi.mock('@/features/selected-bias/ui/use-selected-bias',()=>({useSelectedBias:()=>bias.value}));
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
// E4: the favorite's creator lucky draws (open, upcoming, closed, cancelled) and its row in the home creator ranking.
const day=86_400_000,iso=(offset:number)=>new Date(Date.now()+offset).toISOString();
const pickupPolicy={version:'test-pickup-v1',method:'on_site_pickup',shippingCountry:null,requiresShippingAcknowledgment:false,recipientWindowDays:7,pickupEndsOn:'2100-01-01',pickupVenue:{ko:'v',en:'v'},pickupInstructions:{ko:'i',en:'i'}};
const creatorRaffle=(n:number,status:string,opens:number,closes:number)=>({id:uid(300+n),benefitId:uid(400+n),title:`Gift ${n}`,summary:'s',imageUrl:null,winnerQuantity:3,status,entryOpensAt:iso(opens),entryClosesAt:iso(closes),resultsPublishedAt:null,fulfillmentMethod:'on_site_pickup',perFanTicketLimit:null,requiresFanVerification:true,fulfillmentPolicy:pickupPolicy});
const allRaffles=()=>[creatorRaffle(3,'closed',-10*day,-2*day),creatorRaffle(2,'preparing',3*day,10*day),creatorRaffle(1,'open',-day,7*day),creatorRaffle(4,'cancelled',-day,7*day)];
let creatorRaffles:unknown[]=[],homeRows:unknown[]=[],roadmapBody:unknown=null;
let homeComparable=true;
const entry=(n:number,amount:number,createdAt:string,asset='fan_point')=>({id:uid(700+n),asset,amount,sourceType:'attendance',sourceId:uid(800+n),celebrityId:null,createdAt,actionKey:null,correctionReason:null,pageName:'Elina'});
let historyEntries:unknown[]=[];
beforeEach(()=>{homeComparable=true;historyEntries=[entry(1,2,'2026-11-08T03:00:00Z'),entry(2,-100,'2026-11-07T03:00:00Z'),entry(3,1,'2026-11-07T02:00:00Z','ticket'),entry(4,2,'2026-11-06T03:00:00Z')];creatorRaffles=allRaffles();homeRows=[{rank:3,slug:'bias-x',name:'Bias X',imageUrl:null,score:125,hearts:795,challenge:false,delta:1,weekGain:null}];roadmapBody=null;bias.value={status:'error',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};historyFails.value=false;resetDukjilCatalogCache();fail=false;failCreators=false;empty=false;invalidCursor=false;joinedCount=0;rankCount=0;catalogOn=true;spotlightCount=0;spotlightFails=false;rankMine=null;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.startsWith('/api/me/wallet/history'))return historyFails.value?Response.json({error:{code:'X'}},{status:503}):Response.json({entries:historyEntries});
  if(url.startsWith('/api/me/dukjil/today'))return Response.json({kstDate:'2026-11-06',policyActive:true,totalPoints:0,actions:{},attendance:null,hasPassport:null});
  if(url.startsWith('/api/dukjil/catalog'))return Response.json(catalogOn?{version:1,rules:{checkin:{points:2},post:{points:20},comment:{points:3},share:{points:10}},missionBook:null}:{version:null,rules:{},missionBook:null});
  if(url.startsWith('/api/groups?limit=4&type=fan&sort=today'))return spotlightFails?Response.json({error:{code:'X'}},{status:500}):Response.json({items:joined(spotlightCount).map(page=>({...page,memberCount:1200000})),nextCursor:null});
  if(url.startsWith('/api/groups?mine=joined&limit=50'))return Response.json({items:joined(joinedCount),nextCursor:null});
  if(url.startsWith('/api/me/attendance?creators='))return Response.json({kstDate:'2026-11-06',items:joined(joinedCount).map((page,i)=>({celebrityId:page.celebrityId,attendedToday:i===0,streak:i===0?3:0,nextBonusIn:4,hasPassport:true}))});
  if(/^\/api\/celebrities\/[^/]+\/raffles/.test(url))return Response.json({raffles:creatorRaffles});
  if(url.startsWith('/api/rankings/home'))return Response.json({day:'2026-11-08',computedAt:'2026-11-08T00:00:00Z',comparable:homeComparable,weekGainDays:null,rows:homeRows});
  if(url.startsWith('/api/benefits?celebrity='))return Response.json({benefits:[]});
  if(/^\/api\/me\/passports\/[^/]+\/roadmap/.test(url))return Response.json(roadmapBody);
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
const favorite={slug:'bias-x',name:'Bias X',image:'/x.webp',passportId:uid(900),tier:'Silver',stage:null,hearts:3};
const withFavorite=()=>{bias.value={status:'ready',options:[favorite],selected:favorite,unverified:null,select:()=>{},retry:()=>{}};};
it('E4: the count waits for the entry list and uses the per-fan limit when nothing is entered yet',async()=>{
 const {raffleAllowance}=await import('./stan-lucky-cheer');const raffle={...creatorRaffle(1,'open',-day,7*day),perFanTicketLimit:3} as any;
 const base={raffle,guest:false,hasPassport:true,tickets:{loading:false,value:7}};
 expect(raffleAllowance({...base,entries:{loading:true,error:false,entry:undefined}})).toEqual({kind:'loading'});
 expect(raffleAllowance({...base,entries:{loading:false,error:true,entry:undefined}})).toEqual({kind:'unknown'});
 expect(raffleAllowance({...base,entries:{loading:false,error:false,entry:null}})).toEqual({kind:'count',count:3});
 expect(raffleAllowance({...base,entries:{loading:false,error:false,entry:{remainingBenefitTickets:1,fanVerified:true} as any}})).toEqual({kind:'count',count:1});
 expect(raffleAllowance({...base,entries:{loading:false,error:false,entry:{remainingBenefitTickets:null,fanVerified:false} as any}})).toEqual({kind:'passport'});
 expect(raffleAllowance({...base,guest:true,entries:{loading:false,error:false,entry:null}})).toEqual({kind:'locked'});
});
it('E4: stamps to the next heart are 9 − (n mod 9), and a full page reads 하트 +1',async()=>{
 const {nextHeartLabel}=await import('./stan-lucky-cheer');
 expect(nextHeartLabel('ko',4)).toBe('다음 하트까지 5칸');expect(nextHeartLabel('ko',0)).toBe('다음 하트까지 9칸');expect(nextHeartLabel('ko',9)).toBe('하트 +1');expect(nextHeartLabel('ko',13)).toBe('다음 하트까지 5칸');
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
  expect(screen.queryByText('137')).toBeNull();
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
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');requests.length=0;
 await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 expect(requests).toContain('/api/me/wallet');
});
it('has complete localized interface labels',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupBenefitsCopy(locale)).every(value=>value.trim())).toBe(true);});

it('retains real raffles and removes point-event requests',async()=>{renderCatalog();await screen.findByText('First raffle');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.getByRole('link',{name:/캡슐/})).toHaveAttribute('href','/my/capsules?locale=ko');expect(screen.getByText(/응모 접수 중/)).toBeInTheDocument();});
it('labels preparing entries and preserves raffle errors',async()=>{const original=globalThis.fetch;let phase='preparing';vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.includes('kind=raffles')?Promise.resolve(phase==='preparing'?Response.json({kind:'raffles',items:[{...raffle,status:'preparing'}],nextCursor:null}):Response.json({error:{code:'UNAVAILABLE'}},{status:503})):original(url,init)));const v=renderCatalog();expect(await screen.findByText(/준비 중/)).toBeInTheDocument();expect(screen.queryByText(/응모 접수 중/)).toBeNull();v.unmount();clearResources();phase='failure';renderCatalog();await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();});

const historyFails=vi.hoisted(()=>({value:false}));
vi.mock('@/features/group-wallet/ui/wallet-screen',async()=>{const {useEffect,useRef}=await import('react');return {WalletHistoryPanel:({preview}:{preview?:{onFailure?:(failed:boolean,retry:()=>void)=>void}})=>{const latest=useRef(preview);useEffect(()=>{latest.current=preview;});useEffect(()=>{if(historyFails.value)latest.current?.onFailure?.(true,()=>{historyFails.value=false;});},[]);return <section><h2 id='wallet-history'>내역</h2></section>;},WalletExchangeDialog:({open,onClose}:{open:boolean;onClose:()=>void})=>open?<div role='dialog' aria-label='응모권 전환'><button onClick={onClose}>전환 닫기</button></div>:null};});


const primaryLabels=()=>[...document.querySelectorAll<HTMLElement>('main a,main button')].filter(el=>!el.closest('[inert]')&&/primary/.test(el.className)&&!(el as HTMLButtonElement).disabled).map(el=>el.textContent);
const withPoints=(points:number)=>{const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));};
const exchangeButton=()=>screen.findByRole('button',{name:'교환'});
it('shows guests a locked history block under the same heading with no tabs or links',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:'내역'});expect(within(section).getByRole('heading',{name:'내역'})).toBeInTheDocument();
 expect(section.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);expect(within(section).queryByRole('link')).toBeNull();expect(within(section).queryByText('아직 내역이 없어요')).toBeNull();
});
it('hides 오늘의 덕질 while the attendance policy is off',async()=>{
 catalogOn=false;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');
 await waitFor(()=>expect(screen.queryByRole('region',{name:'오늘의 덕질'})).toBeNull());expect(requests.some(url=>url.includes('/api/me/attendance'))).toBe(false);
});
it('draws the favorite the server read while the browser is still signing in, then follows the browser', async () => {
 const initial = {slug:'server-pick',name:'Server Pick',image:'/images/x.png',passportId:uid(900),tier:'Bronze' as const,stage:null};
 bias.value = {status:'loading',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
 const {rerender} = render(<GroupBenefitsScreen locale='ko' initialHeart={initial}/>);
 expect(screen.getByRole('region',{name:'최애 응원'})).toHaveTextContent('Server Pick');
 // F1: the header capsule carries 등급 · 최애 · ♥ · P, so the 덕질 body draws no status bar of its own.
 expect(document.querySelector('[data-selected-bias-bar]')).toBeNull();
 bias.value = {status:'ready',options:[],selected:{...initial,slug:'stored-pick',name:'Stored Pick'},unverified:null,select:()=>{},retry:()=>{}};
 rerender(<GroupBenefitsScreen locale='ko' initialHeart={initial}/>);
 expect(screen.getByRole('region',{name:'최애 응원'})).toHaveTextContent('Stored Pick');
});

it('with no session cookie the signed-out heart and wallet are drawn before the browser finishes signing in', () => {
 auth.ready = false;
 try {
  bias.value = {status:'loading',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
  render(<GroupBenefitsScreen locale='ko' signedOut/>);
  for (const pick of screen.getAllByText('최애 고르기')) expect(pick.closest('a')!.getAttribute('href')).toContain('/login');
  expect(document.querySelector('[data-wallet-card] [aria-busy="true"]')).toBeNull();
  expect(screen.getAllByRole('img',{name:'로그인 후 확인'}).length).toBeGreaterThan(0);
 } finally { auth.ready = true; }
});

// ── r5 (plan-ux r5.1 3.2·3.3·4-E, 수용 기준 R2·R5·R7·R12·R19·R20) ──
const blocks=()=>[...document.querySelectorAll('[data-block]')].filter(el=>!el.closest('[hidden]')).map(el=>el.getAttribute('data-block'));
it('r5 A1: 덕질 has the 오늘 · 내역 tabs, no 오늘의 덕질 and the body/aside blocks in order',async()=>{
 withFavorite();render(<GroupBenefitsScreen locale='ko'/>);
 const tabs=screen.getByRole('navigation',{name:'덕질'});
 expect(within(tabs).getAllByRole('link').map(link=>[link.textContent,link.getAttribute('href'),link.getAttribute('aria-current')])).toEqual([['오늘','/benefits?locale=ko','page'],['내역','/benefits?tab=history&locale=ko',null]]);
 await screen.findByText('Gift 1');
 expect(screen.queryByText('오늘의 덕질')).toBeNull();expect(requests.some(url=>url.includes('/api/me/attendance?creators='))).toBe(false);
 await waitFor(()=>expect(blocks()).toEqual(['wallet','list','lucky','aside-card','aside-card']));
});
it('r5 A1·A3: the 내역 tab draws the balance line, the segment and rows grouped by day; the tab press swaps the body at once',async()=>{
 const view=render(<GroupBenefitsScreen locale='ko' tab='history'/>);
 expect(await screen.findByText('2026.11.08')).toBeInTheDocument();expect(screen.getByText('2026.11.07')).toBeInTheDocument();
 const rows=[...document.querySelectorAll('[data-row="transaction"]')].map(row=>row.textContent);
 expect(rows).toEqual(expect.arrayContaining([expect.stringContaining('+2P'),expect.stringContaining('-100P'),expect.stringContaining('+1장')]));
 expect(screen.getAllByRole('navigation')).toHaveLength(2);
 expect(document.querySelector('[data-wallet-card]')).toBeNull();
 view.rerender(<GroupBenefitsScreen locale='ko' tab='today'/>);
 expect(document.querySelector('[data-wallet-card]')).not.toBeNull();
});
it('r5 A2: the balance card is one hero number with 적립·사용 ›, one 교환 and three rate rows from the API values',async()=>{
 withFavorite();render(<GroupBenefitsScreen locale='ko'/>);
 const card=document.querySelector<HTMLElement>('[data-wallet-card="stan"]')!;
 await waitFor(()=>expect(card.querySelector('[data-metric-id="wallet-points"]')).toHaveTextContent('137P'));
 expect(card.querySelector('[data-balance-history]')).toHaveAttribute('href','/benefits?tab=history&locale=ko');
 const rows=[...card.querySelectorAll('[data-row="label-value"]')];
 expect(rows.map(row=>row.querySelector('[data-meta]')?.textContent)).toEqual(['100P = 응모권 1장','9칸 = 하트 1','하트 1 = 찐팬 1']);
 expect(rows[0]).toHaveTextContent('7장');expect(rows[2]).toHaveTextContent('3');
 expect(within(card).getAllByRole('button')).toHaveLength(1);expect(card.textContent).not.toMatch(/광고 보고|안내/);
 expect(card.querySelector('[data-help-tip],[data-help-hint]')).toBeNull();
});
it('r5 A2: 교환 is the primary while no draw is open, secondary while one is open (then 응모하기 is), and disabled under the rate',async()=>{
 withFavorite();creatorRaffles=[creatorRaffle(2,'preparing',3*day,10*day)];const first=render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(document.querySelector('[data-exchange]')).toHaveAttribute('data-exchange','primary'));
 expect(primaryLabels()).toEqual(['교환']);
 first.unmount();clearResources();creatorRaffles=allRaffles();render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(document.querySelector('[data-exchange]')).toHaveAttribute('data-exchange','secondary'));
 await waitFor(()=>expect(primaryLabels()).toEqual(['응모하기']));
});
it('r5 A2: 교환 is disabled at 99 points and opens the exchange at 100',async()=>{
 withPoints(99);const low=render(<GroupBenefitsScreen locale='ko'/>);expect(await exchangeButton()).toBeDisabled();low.unmount();clearResources();
 withPoints(100);render(<GroupBenefitsScreen locale='ko'/>);const button=await exchangeButton();expect(button).toBeEnabled();
 fireEvent.click(button);expect(screen.getByRole('dialog',{name:'응모권 전환'})).toBeInTheDocument();
});
it('r5 A2: guests keep the card with locked values and one login primary; zero values read 0 P · 0장 · 0/9 · 0',async()=>{
 auth.authenticated=false;const guest=render(<GroupBenefitsScreen locale='ko'/>);
 const card=await waitFor(()=>document.querySelector<HTMLElement>('[data-wallet-card="stan"]')!);
 await waitFor(()=>expect(within(card).getByRole('link',{name:'로그인'})).toBeInTheDocument());
 expect(card.querySelectorAll('[role="img"]').length).toBeGreaterThanOrEqual(4);expect(within(card).queryByRole('button')).toBeNull();
 expect(document.querySelector('[data-lucky-module] [data-fan-action-emphasis],[data-lucky-module] button')).toBeNull();
 guest.unmount();clearResources();auth.authenticated=true;
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0,tickets:0})):base(url,init)));
 withFavorite();bias.value={...bias.value,selected:{...favorite,passportId:undefined,hearts:0}};render(<GroupBenefitsScreen locale='ko'/>);
 const zero=document.querySelector<HTMLElement>('[data-wallet-card="stan"]')!;
 await waitFor(()=>expect(zero.querySelector('[data-metric-id="wallet-points"]')).toHaveTextContent('0P'));
 expect(zero.textContent).toContain('0장');expect(zero.textContent).toContain('0/9');expect(zero.textContent).not.toContain('—');
});
const lucky=()=>document.querySelector<HTMLElement>('[data-lucky-module]')!;
const luckyCells=()=>[...lucky().querySelectorAll('[data-cell]')].map(cell=>cell.textContent);
it('r5 A5: the lucky module has one stage graphic, three label-values and one action in each of its three states',async()=>{
 withFavorite();creatorRaffles=[creatorRaffle(1,'open',-day,7*day)];const open=render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','open'));
 await waitFor(()=>expect(luckyCells()[0]).toBe('응모 가능7장'));
 expect(luckyCells()[1]).toMatch(/^마감\d{2}\. \d{2}\. \d{2}:\d{2}$/);expect(luckyCells()[2]).toBe('당첨3명');
 expect(lucky().querySelectorAll('svg[data-art="lucky-machine"]')).toHaveLength(1);expect(lucky().querySelectorAll('img,video')).toHaveLength(0);
 expect(within(lucky()).getByRole('link',{name:'응모하기'})).toHaveAttribute('href',expect.stringContaining(uid(401)));
 open.unmount();clearResources();
 creatorRaffles=[creatorRaffle(2,'preparing',3*day,10*day)];const preparing=render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','preparing'));
 const wait=within(lucky()).getByRole('button');expect(wait).toBeDisabled();expect(wait.textContent).toMatch(/시작$/);
 expect(document.querySelectorAll('main button:disabled').length).toBeLessThanOrEqual(2);
 preparing.unmount();clearResources();
 creatorRaffles=[creatorRaffle(3,'closed',-10*day,-2*day),creatorRaffle(5,'closed',-20*day,-12*day)];render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','closed'));
 await waitFor(()=>expect(luckyCells()[0]).toBe('내 응모0장'));
 expect(within(lucky()).getByRole('link',{name:'결과 보기'})).toBeInTheDocument();
 const past=lucky().querySelector('[data-row="notice"]')!;expect(past).toHaveTextContent('지난 럭키드로우');expect(past.querySelector('[data-meta]')).toHaveTextContent(/^Gift 5 · 3명 · 발표 /);
});
it('r5 A5: with no draw yet the module is 준비 중 (no empty box): 다음 주 and one disabled 다음 주 시작',async()=>{
 withFavorite();creatorRaffles=[];render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','preparing'));
 expect(luckyCells()).toEqual(['응모 가능7장','시작다음 주']);
 expect(within(lucky()).getByRole('button',{name:'다음 주 시작'})).toBeDisabled();
 expect(screen.queryByText('지금 진행 중인 럭키드로우가 없어요')).toBeNull();
});
it('r5 A5: an open draw with no ticket keeps 응모하기 active and opens the exchange',async()=>{
 withFavorite();creatorRaffles=[creatorRaffle(1,'open',-day,7*day)];
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:250,tickets:0})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);
 const enter=await within(await waitFor(()=>lucky())).findByRole('button',{name:'응모하기'});expect(enter).toBeEnabled();
 fireEvent.click(enter);expect(screen.getByRole('dialog',{name:'응모권 전환'})).toBeInTheDocument();
});
it('r5 A5: guests see the stage and locked values with no action; a viewer without a favorite gets the pick row',async()=>{
 auth.authenticated=false;const guest=render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','guest'));
 expect(lucky().querySelectorAll('a,button')).toHaveLength(0);expect(lucky().querySelectorAll('[role="img"]').length).toBeGreaterThan(0);
 guest.unmount();clearResources();auth.authenticated=true;
 bias.value={status:'ready',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(lucky()).toHaveAttribute('data-lucky-state','pick'));
 expect(within(lucky()).getByRole('link',{name:/최애 고르기/})).toHaveAttribute('href','/pages/groups?locale=ko');
});
it('r5 A5: the cheer card is who + 내 하트 + 순위 with its count basis, then 팬 순위 보기; outside the top 20 reads 20위 밖',async()=>{
 withFavorite();const first=render(<GroupBenefitsScreen locale='ko'/>);
 const cheer=await screen.findByRole('region',{name:'최애 응원'});
 await waitFor(()=>expect(cheer).toHaveTextContent('3위'));
 expect(cheer).toHaveTextContent('Bias X');expect(cheer).toHaveTextContent('크리에이터');
 expect(cheer.querySelector('[data-ranking-basis]')).toHaveTextContent('집계 하트 · 매일 00:00');
 expect([...cheer.querySelectorAll('[data-row="label-value"]')].map(row=>row.querySelector('dt')?.textContent)).toEqual(['내 하트','순위집계 하트 · 매일 00:00']);
 expect(within(cheer).getByRole('link',{name:'팬 순위 보기'})).toHaveAttribute('href','/bias-x?tab=fans&locale=ko');
 expect(cheer.querySelector('[data-direction="up"]')).not.toBeNull();
 first.unmount();clearResources();homeRows=[];render(<GroupBenefitsScreen locale='ko'/>);
 const out=await screen.findByRole('region',{name:'최애 응원'});await waitFor(()=>expect(out).toHaveTextContent('20위 밖'));
});
it('r5 A5: without a day to compare the cheer card draws no rank change',async()=>{
 withFavorite();homeComparable=false;render(<GroupBenefitsScreen locale='ko'/>);
 const cheer=await screen.findByRole('region',{name:'최애 응원'});await waitFor(()=>expect(cheer).toHaveTextContent('3위'));
 expect(cheer.textContent).not.toMatch(/[▲▼—]/);
});
it('r5 A4: 오늘 할 것 rows are mission rows with an outline icon, 0/N beside the title, a 2px bar and +NP in ink; 출석 has no button',async()=>{
 withFavorite();const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.startsWith('/api/dukjil/catalog')?Promise.resolve(Response.json({version:1,rules:{checkin:{points:2},post:{points:20,dailyLimit:3},comment:{points:3,dailyLimit:10},share:{points:10,dailyLimit:3}},missionBook:null})):url.startsWith('/api/me/dukjil/today')?Promise.resolve(Response.json({kstDate:new Date(Date.now()+9*3600_000).toISOString().slice(0,10),policyActive:true,totalPoints:0,actions:{post:{count:0,points:0,remaining:3,stamped:false},comment:{count:0,points:0,remaining:10,stamped:false},share:{count:1,points:10,remaining:2,stamped:false}},attendance:null,hasPassport:null})):base(url,init)));joinedCount=1;render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:'오늘 할 것'});
 await waitFor(()=>expect(section.querySelector('[data-mission-reset]')).toHaveTextContent(/개 남음 · 자정 리셋$/));
 const rows=[...section.querySelectorAll('[data-missions-today] [data-row="mission"]')];
 expect(rows.length).toBeGreaterThanOrEqual(3);
 const post=section.querySelector('[data-mission="post"]')!;
 expect(post.querySelector('[data-mission-art] svg[data-icon-set="lucide"]')).not.toBeNull();expect(post.querySelector('img')).toBeNull();
 expect(post.querySelector('[data-mission-reward]')).toHaveTextContent('+20P');
 expect(post.querySelector('[data-mission-title]')).toHaveTextContent('글쓰기0/3');expect(post.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuemax','3');
 expect(section.querySelector('[data-mission="checkin"] button')).toBeNull();
 expect(section.textContent).not.toContain('출석하기');
});
it('r5 A3: the aside history card shows the last three rows with 전체 보기 › to the 내역 tab; an empty list is one sentence',async()=>{
 const first=render(<GroupBenefitsScreen locale='ko'/>);
 const card=await screen.findByRole('region',{name:'내역'});await waitFor(()=>expect(card.querySelectorAll('[data-row="transaction"]')).toHaveLength(3));
 expect(card.querySelector('[data-row="transaction"]')).toHaveTextContent('Elina · 2026.11.08');
 expect(within(card).getByRole('link',{name:'전체 보기'})).toHaveAttribute('href','/benefits?tab=history&locale=ko');
 first.unmount();clearResources();historyEntries=[];render(<GroupBenefitsScreen locale='ko'/>);
 const empty=await screen.findByRole('region',{name:'내역'});expect(await within(empty).findByText('내역이 없습니다')).toBeInTheDocument();
});
it('r5: shows one combined alert with one retry when the wallet and the history both fail',async()=>{
 historyFails.value=true;const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({error:{code:'X'}},{status:503})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);
 await waitFor(()=>expect(screen.getAllByRole('alert')).toHaveLength(1));
});
it('r5 V12: holds the missions section in place while the policy is still loading', () => {
 render(<GroupBenefitsScreen locale='ko'/>);
 expect(document.querySelector('[data-missions-pending][data-block="list"]')).not.toBeNull();
});
