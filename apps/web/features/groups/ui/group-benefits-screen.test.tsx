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
beforeEach(()=>{homeComparable=true;creatorRaffles=allRaffles();homeRows=[{rank:3,slug:'bias-x',name:'Bias X',imageUrl:null,score:125,hearts:795,challenge:false,delta:1,weekGain:null}];roadmapBody=null;bias.value={status:'error',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}};resetDukjilCatalogCache();fail=false;failCreators=false;empty=false;invalidCursor=false;joinedCount=0;rankCount=0;catalogOn=true;spotlightCount=0;spotlightFails=false;rankMine=null;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet/history')return Response.json({entries:[]});
  if(url.startsWith('/api/benefits?')){
   expect(new URL(url,'https://local.test').searchParams.get('celebrity')).toBeTruthy();
   return Response.json({benefits:[]});
  }
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.startsWith('/api/me/dukjil/today'))return Response.json({kstDate:'2026-11-06',policyActive:true,totalPoints:0,actions:{},attendance:null,hasPassport:null});
  if(url.startsWith('/api/dukjil/catalog'))return Response.json(catalogOn?{version:1,rules:{checkin:{points:2},post:{points:20},comment:{points:3},share:{points:10}},missionBook:null}:{version:null,rules:{},missionBook:null});
  if(url.startsWith('/api/groups?limit=4&type=fan&sort=today'))return spotlightFails?Response.json({error:{code:'X'}},{status:500}):Response.json({items:joined(spotlightCount).map(page=>({...page,memberCount:1200000})),nextCursor:null});
  if(url.startsWith('/api/groups?mine=joined&limit=50'))return Response.json({items:joined(joinedCount),nextCursor:null});
  if(url.startsWith('/api/me/attendance?creators='))return Response.json({kstDate:'2026-11-06',items:joined(joinedCount).map((page,i)=>({celebrityId:page.celebrityId,attendedToday:i===0,streak:i===0?3:0,nextBonusIn:4,hasPassport:true}))});
  if(/^\/api\/celebrities\/[^/]+\/raffles/.test(url))return Response.json({raffles:creatorRaffles});
  if(url.startsWith('/api/rankings/home'))return Response.json({day:'2026-11-08',computedAt:'2026-11-08T00:00:00Z',comparable:homeComparable,weekGainDays:null,rows:homeRows});
  if(url.startsWith('/api/groups/capsules'))return Response.json({items:[],nextCursor:null}); // B2 capsule machine: none public
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
function duoData() {
 withFavorite(); joinedCount=2;
 const base=fetch;
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
  if(url.includes('/fans?'))return Promise.resolve(Response.json({likeCount:0,fanCount:12,publicFanCount:12,fans:[]}));
  if(url.startsWith('/api/groups/resolve/'))return Promise.resolve(Response.json({page:joined(1)[0],membership:null,bookmarked:false}));
  if(url.includes('/public-people?'))return Promise.resolve(Response.json({items:Array.from({length:5},(_,i)=>({nickname:'Fan '+(i+1),avatarUrl:null,tier:'Silver',hearts:3280-i,stamps:4,first_jjinfan_at:null})),nextCursor:null}));
  if(url.includes('/leaderboard?'))return Promise.resolve(Response.json({membershipCount:12,fanCount:12,available:false,asOf:'2026-11-10T00:00:00Z',rows:[],me:null}));
  if(url==='/api/me/wallet/history')return Promise.resolve(Response.json({entries:[1,2,3].map((n)=>({id:uid(n),asset:'fan_point',amount:20,sourceType:'dukjil_action',sourceId:uid(n+100),celebrityId:null,actionKey:'post',createdAt:'2026-11-09T10:'+String(35-n)+':00Z'}))}));
  return base(url,init);
 }));
}
it('대표 11/11: the tickets result links to my raffles and the points under it read 137/100P',async()=>{
 duoData();render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');
 const card=document.querySelector('[data-wallet-card]')!;
 expect(card.querySelector('[data-cell="tickets"]')).toHaveAttribute('href','/my/raffles?locale=ko');
 expect(card.querySelector('[data-cell="points"]')).toHaveTextContent('137/100P');
 expect(card.querySelector('[data-cell="points"] [role="progressbar"]')).toHaveAttribute('aria-valuenow','100');
});
it('대표 11/11: without an ad unit 교환 and 받기 stay disabled even when affordable or full',async()=>{
 adUnit.value=undefined;
 try{
  withFavorite();roadmapBody={passportId:uid(900),celebrityId:uid(901),hearts:3,pages:[{pageNo:1,slots:Array.from({length:9},(_,i)=>({slotNo:i+1,kind:null,state:'filled',stampId:null,clearedAt:null})),filled:9,claimable:true,claimed:false,locked:false,lockedReason:null}]};
  render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');
  await waitFor(()=>expect(document.querySelector('[data-cell="stamps"]')).toHaveTextContent('9/9'));
  expect(screen.getByRole('button',{name:'교환'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'받기'})).toBeDisabled();
  expect(screen.queryByRole('link',{name:'받기'})).toBeNull();
 }finally{adUnit.value='/123/rewarded';}
});
it('DUO: preserves the approved block order, four tiles and a single check-in action',async()=>{
 duoData(); const v=render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('글쓰기');
 const blocks=v.container.querySelectorAll('[data-duo-profile],[data-duo-lucky],[data-wallet-card],[data-fan-missions],[data-duo-today],[data-duo-rail],[data-duo-history]');
 expect([...blocks].map(el=>el.getAttributeNames().find(n=>n.startsWith('data-duo-')||n==='data-wallet-card'||n==='data-fan-missions'))).toEqual(['data-wallet-card','data-duo-lucky','data-fan-missions']);
 expect([...v.container.querySelectorAll('[data-cell]')].map(n=>n.getAttribute('data-cell'))).toEqual(['tickets','points','hearts','stamps']);
 // C4: no blur, no cover, no inert ancestor; only the enter button rests, with its reason attached.
 const card=v.container.querySelector('[data-duo-lucky]') as HTMLElement;
 expect(card.closest('[inert],[aria-hidden="true"],[aria-disabled="true"]')).toBeNull();
 expect(screen.queryByRole('status')).toBeNull();
 const enter=within(card).getByRole('button',{name:'응모하러 가기'});
 expect(enter).toBeDisabled();expect(enter).not.toHaveAttribute('href');
 expect(document.getElementById(enter.getAttribute('aria-describedby')!)).toHaveTextContent('준비 중');
 expect(card).toHaveAttribute('data-lucky-paused');expect(card).toHaveAttribute('data-lucky-module');
 expect(card.querySelector('[data-lucky-stage]')).not.toBeNull();
 expect(v.container.querySelectorAll('[data-mission="checkin"]')).toHaveLength(1);
 expect(v.container.querySelector('[data-duo-today]')).toBeNull();
 expect(v.container.querySelector('[data-wallet-card]')?.querySelector('.lucide-chevron-right')).toBeNull();
});
it('DUO: highlights the nearest open draw, actual allowance and exactly one primary action',async()=>{
 duoData();render(<GroupBenefitsScreen locale='ko'/>);
 const lucky=await screen.findByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await waitFor(()=>expect(lucky.querySelector('[data-raffle-cost]')).toHaveTextContent('응모권 1장 · 지금 7번 가능'));
 expect(within(lucky).getByText('Gift 1')).toBeInTheDocument();expect(within(lucky).queryByText('Gift 2')).toBeNull();
 expect(within(lucky).queryByRole('link',{name:/응모하러 가기/})).toBeNull();
 expect(within(lucky).getByRole('button',{name:/응모하러 가기/})).toBeDisabled();
 expect(lucky.querySelector('strong')).toHaveTextContent('7');
});
it('DUO: keeps policy and passport entry restrictions in the spotlight',async()=>{
 duoData();creatorRaffles=[{...creatorRaffle(1,'open',-day,7*day),fulfillmentPolicy:null}];render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('받는 방법이 정해지면 응모할 수 있어요');expect(screen.queryByRole('link',{name:/응모하러 가기/})).toBeNull();
 expect(screen.getByRole('button',{name:/응모하러 가기/})).toBeDisabled();
});
it('DUO: with no draw the past-draws link still opens and the resting button sends nothing',async()=>{
 duoData();creatorRaffles=[];render(<GroupBenefitsScreen locale='ko'/>);
 const past=await screen.findByRole('link',{name:/지난 럭키드로우/});expect(past).toHaveAttribute('href','/c/bias-x/raffles?locale=ko');
 const enter=screen.getByRole('button',{name:'응모하러 가기'});expect(enter).toBeDisabled();
 const before=[...requests];fireEvent.click(enter);expect(requests).toEqual(before);
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true);
});
it('DUO: opens exchange only from its tile, restores focus on Escape and makes no mutation on open',async()=>{
 duoData();render(<GroupBenefitsScreen locale='ko'/>);
 const trigger=await screen.findByRole('button',{name:'교환'});await waitFor(()=>expect(trigger).toBeEnabled());
 expect(screen.queryByRole('dialog')).toBeNull();trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog',{name:'교환하기'});
 expect(within(dialog).getByRole('group',{name:'수량'})).toHaveTextContent('1장');
 expect(within(dialog).getByRole('button',{name:'교환하기'})).toBeInTheDocument();
 fireEvent.keyDown(dialog,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(trigger).toHaveFocus();expect(requests.some(p=>p.includes('/exchange')||p.includes('/ad-session'))).toBe(false);
});
it('DUO: keeps unaffordable exchange disabled and enables it after the shared wallet event',async()=>{
 duoData();const base=fetch;let points=99;
 vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url==='/api/me/wallet'?Promise.resolve(Response.json({...wallet,points})):base(url,init)));
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('99');expect(screen.getByRole('button',{name:'교환'})).toBeDisabled();
 points=100;act(()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 await waitFor(()=>expect(screen.getByRole('button',{name:'교환'})).toBeEnabled());
});
it.each(APP_LOCALES)('DUO: keeps the signed-out layout and locks balances in %s without private reads',async(locale)=>{
 auth.authenticated=false;session.ownerId=null as any;bias.value={...bias.value,status:'guest'};
 const v=render(<GroupBenefitsScreen locale={locale}/>);await screen.findAllByRole('link',{name:walletCopy(locale).login});
 // 59bc0b1ba: signed out, one login scene replaces the wallet's cells.
 expect(v.container.querySelectorAll('[data-wallet-card] [data-cell]')).toHaveLength(0);
 expect(v.container.querySelector('[data-wallet-card]')?.textContent).not.toContain('137');
 expect(requests.some(url=>url.startsWith('/api/me/'))).toBe(false);
 expect(requests.some(url=>url.includes('mine=joined')||url.includes('/leaderboard')||url.includes('/public-people'))).toBe(false);
});
it('DUO: the server signed-out hint shows login prompts before client auth is ready',()=>{
 auth.ready=false;auth.authenticated=false;session.ready=false;session.ownerId=null as any;
 bias.value={...bias.value,status:'loading'};
 const v=render(<GroupBenefitsScreen locale='ko' signedOut/>);
 try{
  expect(v.container.querySelector('[data-duo-profile]')).toBeNull();
  expect(requests).toHaveLength(0);
 }finally{v.unmount();auth.ready=true;session.ready=true;}
});
it('사용자 결정 B: the stamp words never read as automatic — 9 − (n mod 9) more to claim, a full page reads 하트 받기 (the mission book button)',async()=>{
 const {nextHeartLabel}=await import('./stan-lucky-cheer');
 expect(nextHeartLabel('ko',4)).toBe('5칸 더 모으면 받기');expect(nextHeartLabel('ko',0)).toBe('9칸 더 모으면 받기');expect(nextHeartLabel('ko',9)).toBe('하트 받기');expect(nextHeartLabel('ko',13)).toBe('5칸 더 모으면 받기');
 expect(nextHeartLabel('en',4)).toBe('5 more to claim');expect(nextHeartLabel('ja',9)).toBe('ハートを受け取る');
});

it('DS-D 9/9: a page already claimed (no next page yet) shows 0/9 and a disabled 받기',async()=>{
 withFavorite();roadmapBody={passportId:uid(900),celebrityId:uid(901),hearts:3,pages:[{pageNo:1,slots:Array.from({length:9},(_,i)=>({slotNo:i+1,kind:null,state:'filled',stampId:null,clearedAt:null})),filled:9,claimable:false,claimed:true,locked:false,lockedReason:null}]};
 render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText('137');const card=document.querySelector('[data-wallet-card]')!;
 await waitFor(()=>expect(card.querySelector('[data-cell="stamps"]')).toHaveTextContent('0/9'));
 expect(card).not.toHaveTextContent('하트 받기');
 expect(within(card as HTMLElement).getByRole('button',{name:'받기'})).toBeDisabled();
});

it('대표 11/11: at 9/9 the hearts column 받기 goes to the passport mission book',async()=>{
 withFavorite();roadmapBody={passportId:uid(900),celebrityId:uid(901),hearts:3,pages:[{pageNo:1,slots:Array.from({length:9},(_,i)=>({slotNo:i+1,kind:null,state:'filled',stampId:null,clearedAt:null})),filled:9,claimable:true,claimed:false,locked:false,lockedReason:null}]};
 render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText('137');const card=document.querySelector('[data-wallet-card]')!;
 await waitFor(()=>expect(card.querySelector('[data-cell="stamps"]')).toHaveTextContent('9/9'));
 expect(within(card as HTMLElement).getByRole('link',{name:'받기'})).toHaveAttribute('href',`/passports/${uid(900)}?locale=ko#mission-book`);
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


it('retains real raffles and removes point-event requests',async()=>{renderCatalog();await screen.findByText('First raffle');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();expect(requests.some(url=>url.includes('kind=missions'))).toBe(false);expect(screen.getByRole('link',{name:/캡슐/})).toHaveAttribute('href','/my/capsules?locale=ko');expect(screen.getByText(/응모 접수 중/)).toBeInTheDocument();});

it('labels preparing entries and preserves raffle errors',async()=>{const original=globalThis.fetch;let phase='preparing';vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.includes('kind=raffles')?Promise.resolve(phase==='preparing'?Response.json({kind:'raffles',items:[{...raffle,status:'preparing'}],nextCursor:null}):Response.json({error:{code:'UNAVAILABLE'}},{status:503})):original(url,init)));const v=renderCatalog();expect(await screen.findByText(/준비 중/)).toBeInTheDocument();expect(screen.queryByText(/응모 접수 중/)).toBeNull();v.unmount();clearResources();phase='failure';renderCatalog();await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).toBeNull();});


it('hides 오늘의 덕질 while the attendance policy is off',async()=>{
 catalogOn=false;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByText('137');
 await waitFor(()=>expect(screen.queryByRole('region',{name:'오늘의 덕질'})).toBeNull());expect(requests.some(url=>url.includes('/api/me/attendance'))).toBe(false);
});

it('V12: holds the missions section in place while the policy is still loading', () => {
 render(<GroupBenefitsScreen locale='ko'/>);
 const pending=document.querySelector('[data-missions-pending]');
 expect(pending).not.toBeNull();
 expect(pending).toHaveTextContent('오늘의 덕질');
});
it('shows one favorite selector beside the daily missions title and preserves the selected page',async()=>{
 duoData();render(<GroupBenefitsScreen locale='ko'/>);
 const section=await screen.findByRole('region',{name:'오늘의 덕질'});
 const selector=within(section).getByRole('button',{name:/Bias X/});
 expect(selector).toHaveAttribute('data-favorite-pick');
 expect(selector.querySelector('[data-creator-avatar] img')).toHaveAttribute('alt','');
 expect(selector.querySelector('[data-creator-avatar]')).toHaveStyle('--avatar-size: 24px');
 expect(document.querySelectorAll('[data-favorite-pick]')).toHaveLength(1);
 expect(within(section).getByRole('heading',{name:'오늘의 덕질'}).parentElement).toContainElement(selector);
 expect(requests).toContain('/api/benefits?celebrity=bias-x&locale=ko');
});
it('shows one favorite picker instead of stamp and heart numbers when no favorite exists',async()=>{
 bias.value={...bias.value,status:'empty'};
 const view=render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('137');
 const picker=view.container.querySelector('[data-cell="favorite-picker"]') as HTMLElement;
 expect(within(picker).getByRole('link',{name:'최애 고르기'})).toHaveAttribute('href','/pages/groups?locale=ko');
 expect(picker).toHaveTextContent(/^최애 고르기$/);
 expect(view.container.querySelector('[data-wallet-card] [data-cell="stamps"]')).toBeNull();
 expect(view.container.querySelector('[data-wallet-card] [data-cell="hearts"]')).toBeNull();
});
