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
beforeEach(()=>{homeComparable=true;creatorRaffles=allRaffles();homeRows=[{rank:3,slug:'bias-x',name:'Bias X',imageUrl:null,score:125,hearts:795,challenge:false,delta:1,weekGain:null}];roadmapBody=null;bias.value={status:'error',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};historyFails.value=false;resetDukjilCatalogCache();fail=false;failCreators=false;empty=false;invalidCursor=false;joinedCount=0;rankCount=0;catalogOn=true;spotlightCount=0;spotlightFails=false;rankMine=null;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet')return Response.json(wallet);
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
it('E4: shows the favorite’s real lucky draws (open first, then upcoming), with dates, winners, the ticket cost and the entries the wallet allows, and no disabled action',async()=>{
 withFavorite();const view=render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});await within(section).findByText('Gift 1');
 expect(requests).toContain('/api/celebrities/bias-x/raffles?locale=ko');
 const cards=[...section.querySelectorAll<HTMLElement>('[data-raffle-status]')];
 expect(cards.map(card=>card.dataset.raffleStatus)).toEqual(['open','preparing']);
 expect(cards[0]).toHaveTextContent(/마감 \d+\. \d+\./);expect(cards[0]).toHaveTextContent('3명 · 현장 수령');
 await waitFor(()=>expect(cards[0].querySelector('[data-raffle-cost]')).toHaveTextContent('응모권 1장 · 지금 7번 가능'));
 expect(within(cards[0]).getByRole('link',{name:/응모하러 가기/})).toHaveAttribute('href',`/c/bias-x/raffles/${uid(401)}?locale=ko`);
 expect(cards[1]).toHaveTextContent(/응모 시작/);expect(cards[1].querySelector('[data-raffle-cost]')).toBeNull();
 expect(within(cards[1]).getByRole('link',{name:/선물 보기/})).toHaveAttribute('href',`/c/bias-x/raffles/${uid(402)}?locale=ko`);
 expect(within(section).getByRole('link',{name:/전체 보기/})).toHaveAttribute('href','/c/bias-x/raffles?locale=ko');
 expect(view.container.textContent).not.toMatch(/럭키드로우 [12]|준비 중|응원하러 가기/);
 expect(view.container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
});
it('E4: when the server would refuse the entry the card says why instead of a count (no policy, no passport) and a failed read is an error with retry',async()=>{
 withFavorite();creatorRaffles=[{...creatorRaffle(1,'open',-day,7*day),fulfillmentPolicy:null}];const first=render(<GroupBenefitsScreen locale='ko'/>);
 let section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});await within(section).findByText('Gift 1');
 let card=section.querySelector<HTMLElement>('[data-raffle-status="open"]')!;
 expect(card).toHaveAttribute('data-raffle-allowance','policy');expect(card).toHaveTextContent('받는 방법이 정해지면 응모할 수 있어요');expect(card).not.toHaveTextContent('번 가능');
 expect(within(card).getByRole('link',{name:/선물 보기/})).toHaveAttribute('href',`/c/bias-x/raffles/${uid(401)}?locale=ko`);
 first.unmount();clearResources();
 // Followed but no passport (bias.unverified): a standalone draw needs the passport first.
 creatorRaffles=allRaffles();bias.value={status:'empty',options:[],selected:null,unverified:{slug:'bias-x',name:'Bias X'},select:()=>{},retry:()=>{}};
 const second=render(<GroupBenefitsScreen locale='ko'/>);section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});await within(section).findByText('Gift 1');
 card=section.querySelector<HTMLElement>('[data-raffle-status="open"]')!;
 expect(card).toHaveAttribute('data-raffle-allowance','passport');expect(card).toHaveTextContent('패스포트를 받으면 응모할 수 있어요');
 expect(within(card).getByRole('link',{name:/패스포트 받기/}).getAttribute('href')).toMatch(/^\/c\/bias-x\/verify\?/);
 second.unmount();clearResources();
 withFavorite();const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>/\/raffles\?/.test(url)?Promise.resolve(Response.json({error:{code:'RAFFLES_UNAVAILABLE'}},{status:503})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByText('럭키드로우를 불러오지 못했어요');expect(within(section).getByRole('button',{name:'다시 시도'})).toBeInTheDocument();
 expect(within(section).queryByText('지금 진행 중인 럭키드로우가 없어요')).toBeNull();
});
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
it('E4: an empty lucky-draw list is one state box with the way to my entries, not placeholder cards',async()=>{
 withFavorite();creatorRaffles=[];render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByText('지금 진행 중인 럭키드로우가 없어요');
 expect(within(section).getByRole('link',{name:/내 응모 내역/})).toHaveAttribute('href','/my/raffles?locale=ko');
 expect(section.querySelectorAll('[data-raffle-status]')).toHaveLength(0);
});
it('F5: with nothing open or upcoming, past draws sit under 지난 럭키드로우 below the empty line, each naming its own close day beside the results day',async()=>{
 withFavorite();
 const closed=(n:number,closes:number)=>({...creatorRaffle(n,'closed',closes-7*day,closes),title:'Same gift',benefitId:uid(499),resultsPublishedAt:iso(-5*day)});
 creatorRaffles=[closed(1,-12*day),closed(2,-10*day),creatorRaffle(4,'cancelled',-day,7*day)];
 render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByText('지금 진행 중인 럭키드로우가 없어요');
 const list=within(section).getByRole('list',{name:'지난 럭키드로우'});
 expect(list).toHaveAttribute('data-raffle-list','past');
 expect(section.querySelector('[data-raffle-status]')!.closest('ul')).toBe(list);
 const cards=[...list.querySelectorAll<HTMLElement>('[data-raffle-status="closed"]')];
 expect(cards).toHaveLength(2);
 const dates=cards.map(card=>card.querySelector('[class*="meta"]')!.textContent);
 for(const text of dates)expect(text).toMatch(/^마감 \d+\. \d+\. · 발표 \d+\. \d+\.$/);
 expect(new Set(dates).size).toBe(2);
 expect(within(cards[0]).getByRole('link',{name:/결과 보기/})).toBeInTheDocument();
 expect(within(section).queryByRole('link',{name:/전체 보기/})).toBeNull();
});
it('E4 · F2: the cheer card shows the favorite’s creator rank, my hearts (the header’s number) and the community numbers, with no send button and no stamp gauge (the wallet has it)',async()=>{
 withFavorite();roadmapBody={passportId:uid(900),celebrityId:uid(901),hearts:3,pages:[{pageNo:1,slots:Array.from({length:9},(_,i)=>({slotNo:i+1,kind:null,state:i<4?'filled':'empty',stampId:null,clearedAt:null})),filled:4,claimable:false,claimed:false,locked:false,lockedReason:null}]};
 const view=render(<GroupBenefitsScreen locale='ko'/>);
 const card=await screen.findByRole('region',{name:'최애 응원'});
 await within(card).findByText('크리에이터 순위 3위');
 expect(card).toHaveTextContent('내 하트');expect(card).toHaveTextContent('3');expect(card).toHaveTextContent('125');expect(card).toHaveTextContent('795');
 expect(within(card).getByRole('link',{name:/팬 순위 보기/})).toHaveAttribute('href','/bias-x?tab=fans&locale=ko');
 expect(within(card).queryByRole('progressbar')).toBeNull();expect(card).not.toHaveTextContent('다음 하트까지');
 expect(within(card).queryByRole('button',{name:/보내기|응원하러/})).toBeNull();
 // F2: the rank lives on the cheer card only; the wallet has no cheer or lucky-draw cell.
 expect(view.container.querySelector('[data-cell="cheer"]')).toBeNull();expect(view.container.querySelector('[data-cell="lucky"]')).toBeNull();
});
it('E4: stamps to the next heart are 9 − (n mod 9), and a full page reads 하트 +1',async()=>{
 const {nextHeartLabel}=await import('./stan-lucky-cheer');
 expect(nextHeartLabel('ko',4)).toBe('다음 하트까지 5칸');expect(nextHeartLabel('ko',0)).toBe('다음 하트까지 9칸');expect(nextHeartLabel('ko',9)).toBe('하트 +1');expect(nextHeartLabel('ko',13)).toBe('다음 하트까지 5칸');
});
it('E4: a favorite outside the top 20 reads 20위 밖',async()=>{
 withFavorite();homeRows=[];render(<GroupBenefitsScreen locale='ko'/>);
 const card=await screen.findByRole('region',{name:'최애 응원'});await within(card).findByText('크리에이터 순위 20위 밖');
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
 expect(screen.queryByText(groupBenefitsCopy('ko').empty.replace(/[.。]$/,''))).not.toBeInTheDocument();
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
 await within(section).findByText(groupBenefitsCopy('ko').empty.replace(/[.。]$/,''));
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
 view.rerender(<LuckyCatalog locale='ko'/>);expect(screen.queryByText('First raffle')).not.toBeInTheDocument();expect(screen.queryByText('Second raffle')).not.toBeInTheDocument();await screen.findAllByText(groupBenefitsCopy('ko').empty.replace(/[.。]$/,''));
});
it('refreshes balances after the shared wallet mutation event',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');requests.length=0;
 await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 expect(requests).toContain('/api/me/wallet');
});
it('has complete localized interface labels',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupBenefitsCopy(locale)).every(value=>value.trim())).toBe(true);});

it('does not invent a rate while wallet loading or invalid',async()=>{
 const original=globalThis.fetch;const resolvers:((value:Response)=>void)[]=[];
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?new Promise<Response>(done=>{resolvers.push(done);}):original(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByRole('heading',{name:groupBenefitsCopy('ko').lucky});
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
 render(<GroupBenefitsScreen locale='ko'/>);const pending=screen.getAllByRole('status');expect(pending.length).toBeGreaterThan(0);expect(pending.some(node=>node.getAttribute('aria-busy')==='true')).toBe(true);expect(screen.queryByText('137')).not.toBeInTheDocument();
 await act(async()=>release());await screen.findAllByText('137');expect(screen.queryByRole('status',{busy:true})).not.toBeInTheDocument();
});





it('F2: the wallet is two assets, their next steps and one action, with the rules behind 안내 and no help button',async()=>{
 withFavorite();render(<GroupBenefitsScreen locale='ko'/>);const button=await screen.findByRole('button',{name:'광고 보고 교환하기'});
 expect(screen.queryByRole('radio')).toBeNull();expect(document.querySelector('fieldset')).toBeNull();
 const card=button.closest('section')!;expect(card).toHaveAttribute('data-wallet-card','stan');expect(card).toHaveTextContent('137P');expect(card).toHaveTextContent('응모권7장');expect(card).toHaveTextContent('교환 가능');
 const hrefs=Object.fromEntries([...card.querySelectorAll<HTMLElement>('[data-cell]')].map(cell=>[cell.dataset.cell,cell.getAttribute('href')]));
 expect(hrefs).toEqual({points:'#stan-history',hearts:'/bias-x?tab=fans&locale=ko',tickets:'/my/raffles?locale=ko',stamps:'/passports?locale=ko'});
 expect(within(card).getByRole('link',{name:'안내'})).toHaveAttribute('href','/guide/dukjil?locale=ko');
 expect(within(card).getAllByRole('button')).toHaveLength(1);expect(card.querySelectorAll('a button, a [role="button"]')).toHaveLength(0);expect(card.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
 expect(screen.queryByRole('button',{name:/도움말|설명/})).toBeNull();expect(document.querySelector('main')!.textContent).not.toContain('준비 중');
 expect(document.getElementById('stan-lucky')).not.toBeNull();expect(document.getElementById('stan-cheer')).not.toBeNull();expect(document.getElementById('stan-history')).not.toBeNull();
 fireEvent.click(button);expect(screen.getByRole('dialog',{name:'응모권 전환'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'전환 닫기'}));expect(screen.queryByRole('dialog')).toBeNull();
});
it('E5: zero values are written as numbers, never a dash',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0,tickets:0})):base(url,init)));
 bias.value={status:'empty',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
 render(<GroupBenefitsScreen locale='ko'/>);const card=(await screen.findByRole('button',{name:'광고 보고 교환하기'})).closest('section')!;
 await waitFor(()=>expect(card).toHaveTextContent('0P'));expect(card).toHaveTextContent('0장');expect(card).toHaveTextContent('0/9');expect(card.textContent).not.toContain('—');
 // r6 visual review: the next-step numbers keep their unit attached (no gap class missing).
 const steps=[...card.querySelectorAll('[data-number-role="asset"]')].filter(n=>/장|\/9/.test(n.textContent??''));expect(steps).toHaveLength(2);expect(steps.every(n=>/stepNumber/.test(n.className))).toBe(true);
});
/* A disabled exchange keeps the common grey pill; only enabled primary controls count as emphasis. */
const primaryLabels=()=>[...document.querySelectorAll<HTMLElement>('main a,main button')].filter(el=>!el.closest('[inert]')&&/primary/.test(el.className)&&!(el as HTMLButtonElement).disabled).map(el=>el.textContent);
const withPoints=(points:number)=>{const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));};
const exchangeButton=()=>screen.findByRole('button',{name:'광고 보고 교환하기'});
it('keeps the exchange a secondary action at the rate boundary (100 and 101)',async()=>{
 for(const points of [100,101]){
  withPoints(points);joinedCount=2;const view=render(<GroupBenefitsScreen locale='ko'/>);
  const button=await exchangeButton();await screen.findByText('Creator 2');
  expect(button).toBeEnabled();expect(button.className).not.toMatch(/primary/);expect(primaryLabels()).not.toContain('교환');
  view.unmount();
 }
});
it('disables the exchange and shows the points left to a ticket when the points fall short (99)',async()=>{
 withPoints(99);joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);
 const button=await exchangeButton();await screen.findByText('Creator 2');
 expect(button).toBeDisabled();expect(button.closest('section')).toHaveTextContent('응모권까지 1P');
 expect(screen.getByRole('progressbar',{name:'응모권까지 1P'})).toHaveAttribute('aria-valuenow','99');
});
it('has no emphasised action at all when the points fall short and nothing is left to check in',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0})):url.startsWith('/api/me/attendance?creators=')?Promise.resolve(Response.json({kstDate:'2026-11-06',items:joined(2).map(page=>({celebrityId:page.celebrityId,attendedToday:true,streak:1,nextBonusIn:4,hasPassport:true}))})):base(url,init)));
 joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);const button=await exchangeButton();await screen.findAllByText('Creator 1');
 expect(button).toBeDisabled();expect(primaryLabels()).toEqual([]);
});
it('enables the exchange when a check-in brings the points to the rate',async()=>{
 let points=95;const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));
 joinedCount=2;render(<GroupBenefitsScreen locale='ko'/>);const button=await exchangeButton();
 expect(button).toBeDisabled();
 points=105;await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 await waitFor(()=>expect(button).toBeEnabled());expect(primaryLabels()).not.toContain('교환');
});
it('never emphasises the exchange (no joined page, points cover the rate)',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await exchangeButton();expect(primaryLabels()).toEqual([]);
});
it('lists joined pages under 오늘의 덕질 with pending pages first and expands past five rows',async()=>{
 joinedCount=7;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('Creator 2');const section=screen.getByRole('region',{name:'오늘의 덕질'});
 const rows=()=>within(section).getAllByRole('listitem');expect(rows()).toHaveLength(5);
 expect(rows()[0]).toHaveTextContent('Creator 2');expect(rows().map(row=>row.textContent).join()).not.toContain('Creator 1');
 // 연속 일수 띠: 연속이 가장 긴 페이지 하나를 제목 아래에 둔다.
 expect(section.querySelector('[data-streak-band]')).toHaveTextContent('Creator 1');expect(section.querySelector('[data-streak-band]')).toHaveTextContent('연속 3일');
 fireEvent.click(within(section).getByRole('button',{name:'전체 보기'}));expect(rows()).toHaveLength(7);expect(within(within(section).getAllByRole('list').at(-1)!).getByText('Creator 1')).toBeInTheDocument();
 expect(within(section).queryByRole('button',{name:'전체 보기'})).toBeNull();
});
it('keeps the wallet card for guests: locked balances, the public exchange rate and the one emphasised login',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 const login=await screen.findByRole('link',{name:'로그인'});const card=login.closest('section')!;
 expect(within(card).getAllByRole('img',{name:'로그인 후 확인'})).toHaveLength(4);expect(card.textContent).not.toContain('—');
 expect(card).toHaveTextContent('응모권까지 100P');expect(card).toHaveTextContent('다음 하트까지 9칸');
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
 const explore=await screen.findByRole('link',{name:/페이지 둘러보기/});const section=screen.getByRole('region',{name:'오늘의 덕질'});
 expect(explore).toHaveAttribute('href','/pages/groups?locale=ko');expect(within(section).queryAllByRole('listitem')).toHaveLength(1);expect(within(section).getByRole('listitem')).toHaveTextContent('가입한 페이지가 없어요');
 first.unmount();clearResources();spotlightFails=true;render(<GroupBenefitsScreen locale='ko'/>);
 const alert=await screen.findByText('출석 정보를 불러오지 못했어요');const failed=screen.getByRole('region',{name:'오늘의 덕질'});
 expect(screen.getAllByRole('link',{name:'로그인'}).length).toBeGreaterThan(0);spotlightFails=false;spotlightCount=2;fireEvent.click(within(failed).getByRole('button',{name:'다시 시도'}));await screen.findByText('Creator 2');
});
it('renders the guest card, tiles and locked cells in every language without a dash or a second emphasised action',async()=>{
 for(const locale of APP_LOCALES){
  auth.authenticated=false;empty=true;spotlightCount=3;const view=render(<GroupBenefitsScreen locale={locale}/>);
  const w=walletCopy(locale);await screen.findByText('Creator 3');
  const login=screen.getAllByRole('link',{name:w.login}).find(link=>link.getAttribute('href')?.startsWith('/login'))!;
  expect(login.getAttribute('href')).toContain(`locale=${locale}`);expect(login.getAttribute('href')).toContain(encodeURIComponent(`/benefits?locale=${locale}`));
  expect(document.querySelectorAll('[data-fan-action-emphasis="primary"]')).toHaveLength(1);
  expect(document.querySelectorAll('[role="img"][aria-label]').length).toBeGreaterThanOrEqual(2);
  expect(view.container.textContent).not.toContain('— P');
  view.unmount();
 }
});
it('collapses the expanded attendance list from the same title-row control',async()=>{
 joinedCount=7;render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('Creator 2');const section=screen.getByRole('region',{name:'오늘의 덕질'});
 fireEvent.click(within(section).getByRole('button',{name:'전체 보기'}));expect(within(section).getAllByRole('listitem')).toHaveLength(7);
 fireEvent.click(within(section).getByRole('button',{name:'접기'}));expect(within(section).getAllByRole('listitem')).toHaveLength(5);expect(within(section).getByRole('button',{name:'전체 보기'})).toHaveAttribute('aria-expanded','false');
});
it('shows one combined alert with one retry when the wallet, attendance and history all fail',async()=>{
 const base=fetch;let broken=true;historyFails.value=true;
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>broken&&(url==='/api/me/wallet'||url.startsWith('/api/groups?mine=joined')||url.startsWith('/api/rankings'))?Promise.resolve(Response.json({error:{code:'X'}},{status:500})):base(url,init)));
 joinedCount=2;rankCount=2;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('요청을 완료하지 못했어요',{},{timeout:5000});
 await waitFor(()=>{const visible=screen.getAllByRole('alert',{hidden:false});expect(visible).toHaveLength(1);expect(visible[0]).toHaveTextContent('요청을 완료하지 못했어요');expect(screen.queryByRole('region',{name:'오늘의 덕질',hidden:false})).toBeNull();expect(screen.queryByRole('region',{name:'랭킹',hidden:false})).toBeNull();expect(screen.queryByRole('region',{name:groupBenefitsCopy('ko').lucky,hidden:false})).toBeNull();expect(document.getElementById('wallet-history')?.closest('[hidden]')).not.toBeNull();},{timeout:5000});
 broken=false;fireEvent.click(within(screen.getAllByRole('alert',{hidden:false})[0]).getByRole('button'));
 await screen.findByText('Creator 2',{},{timeout:5000});await waitFor(()=>expect(screen.queryAllByRole('alert',{hidden:false})).toHaveLength(0),{timeout:5000});
},15000);
it('shows the empty state with a way to explore pages when no page is joined',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('가입한 페이지가 없어요');const section=screen.getByRole('region',{name:'오늘의 덕질'});
expect(within(section).getByRole('link',{name:/가입한 페이지가 없어요.*페이지 둘러보기/})).toHaveAttribute('href','/pages/groups?locale=ko');
});
it('hides 오늘의 덕질 while the attendance policy is off',async()=>{
 catalogOn=false;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');
 await waitFor(()=>expect(screen.queryByRole('region',{name:'오늘의 덕질'})).toBeNull());expect(requests.some(url=>url.includes('/api/me/attendance'))).toBe(false);
});
it('does not offer a conversion the balance cannot cover',async()=>{
 const base=fetch;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points:0})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);expect(await screen.findByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();
});
it('keeps conversion closed with a notice until an ad unit is configured',async()=>{
 adUnit.value=undefined;empty=true;render(<GroupBenefitsScreen locale='ko'/>);const off=await screen.findByRole('button',{name:'광고 보고 교환하기'});expect(off).not.toBeDisabled();expect(screen.queryByText(/광고 준비 중/)).toBeNull();adUnit.value='/123/rewarded';
});
it('moves the ranking out of 덕질 and folds the missions into today, more and certifications',async()=>{
 joinedCount=1;const view=render(<GroupBenefitsScreen locale='ko'/>);
 const missions=await screen.findByRole('region',{name:'오늘의 미션'});
 expect(requests.some(url=>url.startsWith('/api/rankings'))).toBe(false);expect(screen.queryByRole('region',{name:'랭킹'})).toBeNull();
 expect(missions.querySelector('[data-all-clear]')).toBeNull();expect(view.container.textContent).not.toContain('전체 완료');
 await waitFor(()=>expect(missions.querySelector('[data-missions-today] li[data-mission]')).not.toBeNull());expect(within(missions).queryByRole('button',{name:/오늘 할 것/})).toBeNull();
 expect(within(missions).getByRole('button',{name:/그 밖의 미션/})).toHaveAttribute('aria-expanded','false');
 expect(missions.querySelector('[data-mission="post"] a')).toHaveAttribute('href','/c1?tab=board&source=fans&compose=1&locale=ko');
});

it('H6: sends the mission rows and the heart cheer to the favorite chosen in the header, not the first joined page',async()=>{
 joinedCount=2;const chosen={slug:'bias-x',name:'Bias X',image:'/x.webp',passportId:'p',tier:'silver',stage:null};
 bias.value={status:'ready',options:[chosen],selected:chosen,unverified:null,select:()=>{},retry:()=>{}};
 render(<GroupBenefitsScreen locale='ko'/>);
 const missions=await screen.findByRole('region',{name:'오늘의 미션'});await waitFor(()=>expect(missions.querySelector('[data-missions-today]')).not.toBeNull());
 await waitFor(()=>expect(missions.querySelector('[data-mission="post"] a')).toHaveAttribute('href','/bias-x?tab=board&source=fans&compose=1&locale=ko'));
 expect(missions.querySelector('[data-mission="comment"] a')!.getAttribute('href')).toMatch(/^\/bias-x\?/);
 // E4: cheering spends nothing; the card names the favorite and leads to its fan ranking, never a disabled send button.
 expect(screen.queryByRole('button',{name:/응원하러 가기/})).toBeNull();
 const cheer=screen.getByRole('region',{name:'최애 응원'});expect(cheer).toHaveTextContent('Bias X');
 expect(within(cheer).getByRole('link',{name:/팬 순위 보기/})).toHaveAttribute('href','/bias-x?tab=fans&locale=ko');
});
it('asks a viewer without a favorite to pick one in the heart cheer card, and guests to log in',async()=>{
 bias.value={status:'empty',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};
 const view=render(<GroupBenefitsScreen locale='ko'/>);const picks=await screen.findAllByRole('link',{name:'최애 고르기'});
 // D2: every "choose" (status bar, wallet cheer cell, heart card) leads to choosing; none is a dead end.
 expect(picks.length).toBeGreaterThanOrEqual(3);for(const pick of picks)expect(pick).toHaveAttribute('href','/pages/groups?locale=ko');view.unmount();
 bias.value={...bias.value,status:'guest'};auth.authenticated=false;render(<GroupBenefitsScreen locale='ko'/>);
 const guestPicks=await screen.findAllByRole('link',{name:'최애 고르기'});for(const pick of guestPicks)expect(pick.getAttribute('href')).toMatch(/^\/login\?/);
});

it('V12: holds the missions section in place while the policy is still loading', () => {
 render(<GroupBenefitsScreen locale='ko'/>);
 const pending=document.querySelector('[data-missions-pending]');
 expect(pending).not.toBeNull();
 expect(pending).toHaveTextContent('오늘의 미션');
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

it('4차: the cheer card draws the rank change only when the home ranking has a day to compare with (no dash otherwise)',async()=>{
 withFavorite();homeComparable=false;render(<GroupBenefitsScreen locale='ko'/>);
 const card=await screen.findByRole('region',{name:'최애 응원'});await within(card).findByText('크리에이터 순위 3위');
 expect(card.querySelector('[data-direction]')).toBeNull();expect(card.textContent).not.toContain('—');
});
it('4차: with a day to compare, the cheer card shows the rank change beside the rank',async()=>{
 withFavorite();render(<GroupBenefitsScreen locale='ko'/>);
 const card=await screen.findByRole('region',{name:'최애 응원'});await within(card).findByText('크리에이터 순위 3위');
 await waitFor(()=>expect(card.querySelector('[data-direction="up"]')).not.toBeNull());
});
