import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WalletHistoryPanel, WalletScreen } from './wallet-screen';
import { clearResources } from '@/components/fan-ui/resource-cache';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
const rewardedAd=vi.hoisted(()=>({unit:'/123/rewarded' as string|undefined,outcome:'earned',requests:0,noClose:false}));
vi.mock('./google-rewarded-ad',()=>({rewardedAdUnit:()=>rewardedAd.unit,loadRewardedGpt:async()=>({}),requestRewardedAd:(_gpt:unknown,_unit:string,onState:(state:string)=>void)=>{rewardedAd.requests++;onState(rewardedAd.outcome);if(rewardedAd.outcome==='earned'&&!rewardedAd.noClose)setTimeout(()=>onState('closed'),5);return {show:()=>true,cancel:()=>{}};}}));
const routeReplace=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({replace:routeReplace})}));
const id='10000000-0000-4000-8000-000000000001';
const wallet={sequence:1,points:240,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-02',checkedIn:false,streak:6,nextBonusIn:1}};
const receipt=(requestKey:string)=>({requestKey,target:'ticket',units:1,pointsSpent:100,pointLedgerId:id,creditLedgerId:id,policyVersion:'group-wallet-v1',createdAt:'2026-11-02T00:00:00Z',replayed:false});
// Server-side ad session endpoints (issue, shown, granted) are answered first; every other path reaches the test's own fetch.
const sessionIds={current:'20000000-0000-4000-8000-000000000002'};
const sessionRefusal={code:''},grantedFirst={left:0};
const sessionAnswer=(url:string)=>url==='/api/me/wallet/ad-session'&&sessionRefusal.code?Response.json({error:{code:sessionRefusal.code}},{status:409}):url==='/api/me/wallet/ad-session'?Response.json({sessionId:sessionIds.current,status:grantedFirst.left-->0?'granted':'issued',expiresAt:'2026-11-02T00:10:00Z'}):url==='/api/me/wallet/ad-session/report'?Response.json({sessionId:sessionIds.current,status:'granted',expiresAt:'2026-11-02T00:10:00Z'}):undefined;
const nativeStub=vi.stubGlobal.bind(vi);
vi.stubGlobal=((name:string,value:unknown)=>name==='fetch'?nativeStub(name,vi.fn(async(url:string,init?:RequestInit)=>sessionAnswer(url)??(value as (u:string,i?:RequestInit)=>Promise<Response>)(url,init))):nativeStub(name,value)) as typeof vi.stubGlobal;
beforeEach(()=>{clearResources();sessionRefusal.code='';grantedFirst.left=0;rewardedAd.noClose=false;rewardedAd.requests=0;sessionStorage.clear();rewardedAd.unit='/123/rewarded';rewardedAd.outcome='earned';});
it('asks for the first stamp instead of a zero-day streak',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,attendance:{...wallet.attendance,streak:0,nextBonusIn:7}})));
 render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'});
 expect(screen.getByRole('heading',{name:'오늘 첫 스탬프를 찍어요'})).toBeInTheDocument();expect(screen.queryByText(/0일 연속/)).toBeNull();
});
it('shows the seventh-day reward',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'});
 expect(screen.getByRole('heading',{name:'6일 연속 출석 중'})).toBeInTheDocument();
 expect(screen.getByText('오늘 일곱 번째 스탬프를 찍어요')).toBeInTheDocument();expect(screen.getByText('매일 출석하면 포인트를 받아요 · 7일 연속 출석하면 보너스 포인트')).toBeInTheDocument();expect(screen.queryByText('+20P')).not.toBeInTheDocument();
});
it('keeps legacy receipts pending instead of reposting them',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'ticket',units:1,policyVersion:'group-wallet-v1'}));
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push(init?.method??'GET');return Response.json(url.includes('/requests/')?{status:'legacy',requiresOriginalContext:true}:url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByRole('heading',{name:'전환 결과를 확인해 주세요'});
 expect(calls).not.toContain('POST');expect(sessionStorage.length).toBe(1);
});

it('disables attendance before the configured reward start date',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}: {...wallet,rewardsStartOn:'2026-11-03'})));
 render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:/부터 출석/})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'교환하기'})).not.toBeInTheDocument();
});
it('renders the balance and a disabled check-in when rewards never start (infinity)',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}: {...wallet,rewardsStartOn:'infinity'})));
 render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:/출석하고 포인트 받기/})).toBeDisabled();
 expect(screen.queryByText('요청을 완료하지 못했어요.')).not.toBeInTheDocument();
});


it('keeps source wallet balances on the shared wallet card',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko' localProfile={{nickname:'스타벅스라이프',avatarUrl:'/images/avatars/star-pink.webp'}} localPresentation={{benefitsHref:'/benefits',historyRows:[{label:'출석체크 · 오늘',value:'포인트 적립'}]}}/>);
 expect(await screen.findByText('240')).toBeInTheDocument();expect(document.querySelector('[data-wallet-card="my"]')).toHaveAttribute('href','/benefits');expect(await screen.findByText('포인트 적립')).toBeInTheDocument();expect(screen.getAllByText('응모권')).toHaveLength(1);expect(screen.queryByRole('button',{name:'교환하기'})).toBeNull();
});
it('renders source balance failure from the real resource and retries the same read',async()=>{
 let reads=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url==='/api/me/wallet'){reads++;return reads===1?Response.json({error:{code:'UNAVAILABLE'}},{status:503}):Response.json(wallet);}return Response.json({entries:[]});}));
 const view=render(<WalletScreen locale='ko'/>);expect(await screen.findByRole('heading',{name:'잔액을 불러오지 못했어요'})).toBeInTheDocument();expect(view.container.querySelector('[data-source-state="QnIgR"]')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'잔액 다시 확인'}));await screen.findByText('240');expect(reads).toBe(2);
});
it('shows only returned attendance points rather than the source example bonus',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,attendance:{...wallet.attendance,checkedIn:true,days:[{date:wallet.attendance.date,points:10}]}})));
 const view=render(<WalletScreen locale='ko' attendance/>);const state=(await screen.findByText('오늘 출석 완료')).closest('p')!;expect(state).toHaveTextContent('10P');expect(state).not.toHaveTextContent('20P');expect(state).not.toHaveTextContent('30P');
});
it('UI021 initial wallet load announces skeleton then shows real balance',async()=>{
 let finish!:(response:Response)=>void;const delayed=new Promise<Response>(resolve=>{finish=resolve;});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url==='/api/me/wallet'?delayed:Response.json({entries:[]})));
 const view=render(<WalletScreen locale='ko'/>);
 const status=await screen.findByRole('status',{name:'불러오는 중'});
 expect(status).toHaveAttribute('aria-busy','true');expect(status.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
 finish(Response.json(wallet));expect(await screen.findByText('240')).toBeInTheDocument();
 view.unmount();
});
it('UI019 attendance dialog shows refreshed actual balance after a local receipt',async()=>{
 let checked=false;const methods:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  methods.push(init?.method??'GET');
  if(url==='/api/me/wallet/check-in'){checked=true;const body=JSON.parse(init!.body as string);return Response.json({requestKey:body.requestKey,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  return Response.json({...wallet,points:checked?270:240,attendance:{...wallet.attendance,checkedIn:checked,streak:checked?7:6,nextBonusIn:checked?7:1,days:checked?[{date:'2026-11-02',points:30}]:[]}});
 }));
 render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('dialog',{name:'출석체크'})).toBeInTheDocument();
 expect(methods).not.toContain('POST');fireEvent.click(await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'}));
 expect(await screen.findByText('포인트 270 P')).toBeInTheDocument();expect(methods.filter(x=>x==='POST')).toHaveLength(1);
});
it('UI019 attendance retries a lost receipt without another check-in',async()=>{
 let key='',checked=false;const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet/check-in'){writes.push(url);key=JSON.parse(init!.body as string).requestKey;checked=true;throw new TypeError('Response lost');}
  if(url.includes('/requests/'))return Response.json({status:'committed',result:{requestKey:key,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false}});
  if(url.endsWith('/history'))return Response.json({entries:[]});
  return Response.json({...wallet,points:checked?270:240,attendance:{...wallet.attendance,checkedIn:checked}});
 }));
 const view=render(<WalletScreen locale='ko' attendance/>);fireEvent.click(await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'}));
 fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));
 expect(await screen.findByText('포인트 270 P')).toBeInTheDocument();expect(writes).toEqual(['/api/me/wallet/check-in']);view.unmount();
});
it('wallet page shows the balance card without any exchange',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko'/>);
 expect(await screen.findByText('240')).toBeInTheDocument();expect(document.querySelector('[data-wallet-card="my"]')).toHaveAttribute('href','/benefits?locale=ko#wallet');
 expect(screen.queryByRole('button',{name:'교환하기'})).toBeNull();
});
const historyRows=(count:number)=>Array.from({length:count},(_,i)=>({id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,asset:'fan_point',amount:i+1,sourceType:'group_check_in',sourceId:id,celebrityId:null,createdAt:`2026-11-0${(i%5)+1}T01:00:00.000Z`}));
it('previews five history rows, expands from the title row, and opens expanded from #wallet-history',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:historyRows(8)}:wallet)));
 window.location.hash='';
 const view=render(<WalletHistoryPanel locale='ko' preview={{rows:5,moreLabel:'전체 보기',lessLabel:'접기'}}/>);
 await screen.findAllByText('출석체크');expect(view.container.querySelectorAll('li')).toHaveLength(5);
 expect(document.getElementById('wallet-history')!.parentElement!.querySelector('button')).toHaveTextContent('전체 보기');
 expect(screen.getByRole('button',{name:'전체 보기'})).toHaveAttribute('aria-expanded','false');
 expect(screen.getByRole('button',{name:'전체 보기'}).querySelector('svg')).toBeNull();
 expect(screen.getByRole('button',{name:'전체 보기'})).toHaveTextContent('›');
 fireEvent.click(screen.getByRole('button',{name:'전체 보기'}));expect(view.container.querySelectorAll('li')).toHaveLength(8);
 expect(screen.getByRole('button',{name:'접기'})).toHaveAttribute('aria-expanded','true');
 expect(screen.getByRole('button',{name:'접기'}).querySelector('svg')).toBeNull();
 expect(screen.getByRole('button',{name:'접기'})).toHaveTextContent('›');
 fireEvent.click(screen.getByRole('button',{name:'접기'}));expect(view.container.querySelectorAll('li')).toHaveLength(5);fireEvent.click(screen.getByRole('button',{name:'전체 보기'}));
 view.unmount();
 window.location.hash='#wallet-history';
 const hashed=render(<WalletHistoryPanel locale='ko' preview={{rows:5,moreLabel:'전체 보기',lessLabel:'접기'}}/>);
 await screen.findAllByText('출석체크');await act(async()=>{});expect(hashed.container.querySelectorAll('li')).toHaveLength(8);
 window.location.hash='';
});
it('F2: holds the preview height for its rows in the empty state, the segment and rows in one card under the heading',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 const view=render(<WalletHistoryPanel locale='ko' preview={{rows:3,moreLabel:'전체 보기',lessLabel:'접기'}}/>);
 await screen.findByText('아직 내역이 없어요');
 const body=view.container.querySelector('[data-history-rows="3"]')!;expect(body).not.toBeNull();expect(body.parentElement!.querySelector('[role="tablist"],nav')).not.toBeNull();
 expect(body.parentElement!.contains(document.getElementById('wallet-history'))).toBe(false);
});
it('keeps the full history list without preview props',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:historyRows(8)}:wallet)));
 const view=render(<WalletHistoryPanel locale='ko'/>);await screen.findAllByText('출석체크');expect(view.container.querySelectorAll('li')).toHaveLength(8);expect(screen.queryByRole('button',{name:'전체 보기'})).toBeNull();
});

it('shows three history rows from 1024px and five below, and names a single ticket in the singular',async()=>{
 const rows=historyRows(8).map((row,i)=>i===0?{...row,asset:'ticket',amount:1,sourceType:'group_exchange'}:row);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:rows}:wallet)));
 vi.stubGlobal('matchMedia',(query:string)=>({matches:true,media:query,addEventListener:()=>{},removeEventListener:()=>{}}));
 try{
  window.location.hash='';
  const view=render(<WalletHistoryPanel locale='en' preview={{rows:5,wideRows:3,moreLabel:'View all',lessLabel:'Show less'}}/>);
  await screen.findAllByText('Exchange');await act(async()=>{});
  expect(view.container.querySelectorAll('li')).toHaveLength(3);
  expect(screen.getByText('+1 Ticket')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'View all'}));expect(view.container.querySelectorAll('li')).toHaveLength(8);
 }finally{vi.unstubAllGlobals();}
});

it('names history rows after the real activity and the correction reason, with the generic name only for unknown activities',async()=>{
 const base={sourceId:id,celebrityId:null,createdAt:'2026-11-05T01:00:00.000Z',asset:'fan_point'};
 const entries=[
  {...base,id:'60000000-0000-4000-8000-000000000001',amount:5,sourceType:'dukjil_action',actionKey:'post'},
  {...base,id:'60000000-0000-4000-8000-000000000002',amount:-20,sourceType:'dukjil_correction',actionKey:'post',correctionReason:'content_deleted'},
  {...base,id:'60000000-0000-4000-8000-000000000003',amount:3,sourceType:'dukjil_action',actionKey:'reaction'},
  {...base,id:'60000000-0000-4000-8000-000000000004',amount:2,sourceType:'dukjil_action'},
 ];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries}:wallet)));
 const view=render(<WalletHistoryPanel locale='ko'/>);
 await screen.findByText('글 쓰기');
 const text=view.container.textContent??'';
 expect(text).toContain('글 삭제로 회수');expect(text).toContain('공감 누르기');expect(text).toContain('활동 참여');
 expect(text).toContain('-20 P');
});
