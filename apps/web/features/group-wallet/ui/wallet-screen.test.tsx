import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WalletExchangeDialog, WalletHistoryPanel, WalletScreen } from './wallet-screen';
import {CreatorBoardAside} from '@/features/groups/ui/creator-board-aside';
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
beforeEach(()=>{sessionRefusal.code='';grantedFirst.left=0;rewardedAd.noClose=false;rewardedAd.requests=0;sessionStorage.clear();rewardedAd.unit='/123/rewarded';rewardedAd.outcome='earned';});
it('recovers a committed exchange after a lost response without another debit',async()=>{
 let key='';const mutations:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.endsWith('/history'))return Response.json({entries:[]});
  if(url.includes('/requests/'))return Response.json({status:'committed',result:receipt(key)});
  mutations.push(url);key=JSON.parse(init!.body as string).requestKey;
  expect(JSON.parse(sessionStorage.getItem('kyaa-wallet-pending:owner-a')!).requestKey).toBe(key);
  throw new TypeError('Response lost');
 }));
 const view=render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByRole('button',{name:'교환 내역 확인'});view.unmount();render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByText('교환했어요');
 expect(mutations).toEqual(['/api/me/wallet/exchange']);expect(sessionStorage.length).toBe(0);
});
it('asks for the first stamp instead of a zero-day streak',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,attendance:{...wallet.attendance,streak:0,nextBonusIn:7}})));
 render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'});
 expect(screen.getByRole('heading',{name:'오늘 첫 도장을 찍어요'})).toBeInTheDocument();expect(screen.queryByText(/0일 연속/)).toBeNull();
});
it('shows the seventh-day reward and blocks exchanges beyond the balance',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 const view=render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'오늘 출석하고 포인트 받기'});
 expect(screen.getByRole('heading',{name:'6일 연속 출석 중'})).toBeInTheDocument();
 expect(screen.getByText('오늘 일곱 번째 도장을 찍어요')).toBeInTheDocument();expect(screen.getByText('매일 출석하면 포인트를 받아요 · 7일 연속 출석하면 보너스 포인트')).toBeInTheDocument();expect(screen.queryByText('+20P')).not.toBeInTheDocument();
 view.rerender(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('button',{name:'광고 보고 교환하기'});
 expect(screen.queryByRole('spinbutton')).toBeNull();expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).toBeEnabled();
});
it('keeps legacy receipts pending instead of reposting them',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'ticket',units:1,policyVersion:'group-wallet-v1'}));
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push(init?.method??'GET');return Response.json(url.includes('/requests/')?{status:'legacy',requiresOriginalContext:true}:url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByRole('heading',{name:'전환 결과를 확인해 주세요'});
 expect(calls).not.toContain('POST');expect(sessionStorage.length).toBe(1);
});

it('disables attendance before the configured reward start date',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}: {...wallet,rewardsStartOn:'2026-11-03'})));
 const view=render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:/부터 출석/})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'광고 보고 교환하기'})).not.toBeInTheDocument();
 view.rerender(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);
 expect(await screen.findByRole('button',{name:'광고 보고 교환하기'})).toBeEnabled();
});


it('hides the quantity control when only one exchange is possible',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,points:199})));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);
 await screen.findByRole('button',{name:'광고 보고 교환하기'});
 expect(screen.queryByRole('group',{name:'수량'})).toBeNull();
 expect(screen.getByText('100 P')).toBeInTheDocument();
});


it('keeps source wallet balances while directing local conversion to benefits',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko' localProfile={{nickname:'스타벅스라이프',avatarUrl:'/images/avatars/star-pink.webp'}} localPresentation={{benefitsHref:'/benefits',historyRows:[{label:'출석체크 · 오늘',value:'포인트 적립'}]}}/>);
 expect(await screen.findByRole('link',{name:'덕질에서 전환·사용'})).toHaveAttribute('href','/benefits');expect(screen.getByText('포인트는 덕질에서 사용해요')).toBeInTheDocument();expect(await screen.findByText('포인트 적립')).toBeInTheDocument();expect(screen.getAllByText('모임 응모권')).toHaveLength(1);expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'광고 보고 교환하기'})).not.toBeInTheDocument();
});
it('renders source balance failure from the real resource and retries the same read',async()=>{
 let reads=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url==='/api/me/wallet'){reads++;return reads===1?Response.json({error:{code:'UNAVAILABLE'}},{status:503}):Response.json(wallet);}return Response.json({entries:[]});}));
 const view=render(<WalletScreen locale='ko'/>);expect(await screen.findByRole('heading',{name:'잔액을 불러오지 못했어요'})).toBeInTheDocument();expect(view.container.querySelector('[data-source-state="QnIgR"]')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'잔액 다시 확인'}));await screen.findByRole('link',{name:'덕질에서 전환·사용'});expect(reads).toBe(2);
});
it('shows only returned attendance points rather than the source example bonus',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,attendance:{...wallet.attendance,checkedIn:true,days:[{date:wallet.attendance.date,points:10}]}})));
 const view=render(<WalletScreen locale='ko' attendance/>);const state=(await screen.findByText('오늘 출석 완료')).closest('p')!;expect(state).toHaveTextContent('10P');expect(state).not.toHaveTextContent('20P');expect(state).not.toHaveTextContent('30P');
});
it('holds an unknown conversion result without reposting or discarding the original request',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'ticket',units:1,policyVersion:'group-wallet-v1'}));const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.includes('/requests/')?{status:'unknown'}:url.endsWith('/history')?{entries:[]}:wallet);}));
 const close=vi.fn();render(<WalletExchangeDialog locale='ko' open onClose={close}/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByRole('heading',{name:'전환 결과를 확인해 주세요'});expect(document.querySelector('[data-source-state="VMiFI"]')).not.toBeNull();expect(screen.queryByRole('link',{name:'교환 내역 확인'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'교환 내역 확인'}));expect(close).toHaveBeenCalledTimes(1);expect(window.location.hash).toBe('#wallet-history');expect(screen.queryByRole('button',{name:'처리 결과 확인'})).not.toBeInTheDocument();expect(writes).toEqual([]);expect(JSON.parse(sessionStorage.getItem('kyaa-wallet-pending:owner-a')!).requestKey).toBe(id);expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();
});



it('board aside sends support and capsule entries to one benefits link',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'UNAVAILABLE'}},{status:503})));
 render(<CreatorBoardAside slug='nchive' locale='ko'/>);
 expect(screen.getByRole('link',{name:'덕질'})).toHaveAttribute('href','/benefits?locale=ko');
 expect(screen.queryByRole('link',{name:'하트 보내기'})).toBeNull();
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
it('wallet page keeps balances and history and directs conversion to benefits',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko'/>);
 expect(await screen.findByRole('link',{name:'덕질에서 전환·사용'})).toHaveAttribute('href','/benefits?locale=ko');
 expect(screen.queryByRole('spinbutton')).toBeNull();expect(screen.queryByRole('button',{name:'광고 보고 교환하기'})).toBeNull();
});
it.each([['cancelled','광고 시청이 완료되지 않았어요. 포인트는 차감되지 않았어요.'],['no-fill','지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.'],['error','광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 포인트는 차감되지 않았어요.']])('does not debit points when the ad ends as %s',async(outcome,message)=>{
 rewardedAd.outcome=outcome;const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 expect(await screen.findByText(message)).toBeInTheDocument();expect(writes).toEqual([]);expect(sessionStorage.length).toBe(0);
});
it('shows the load-failure text, not the no-ad text, for an unknown session refusal code',async()=>{
 sessionRefusal.code='GROUP_WALLET_SOMETHING_NEW';const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 expect(await screen.findByText('광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 포인트는 차감되지 않았어요.')).toBeInTheDocument();
 expect(screen.queryByText('지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.')).toBeNull();expect(rewardedAd.requests).toBe(0);
});
it('does not debit points without a configured ad unit',async()=>{
 rewardedAd.unit=undefined;const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('지금은 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.');expect(writes).toEqual([]);
});
it('keeps the exchange action pressable without an ad unit and reports the refusal after the press',async()=>{
 rewardedAd.unit=undefined;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('지금은 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.');
 expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).not.toBeDisabled();
});
it('sends the exchange once after the ad grants its reward',async()=>{
 const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){writes.push(url);const body=JSON.parse(init.body as string);expect(body.target).toBe('ticket');expect(body.units).toBe(1);expect(body.adSessionId).toBe(sessionIds.current);return Response.json({...receipt(body.requestKey),target:'ticket'});}return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('교환했어요');expect(writes).toEqual(['/api/me/wallet/exchange']);
});

it.each([['GROUP_WALLET_AD_DAILY_LIMIT','하루'],['GROUP_WALLET_AD_RATE_LIMITED',''],['GROUP_WALLET_INSUFFICIENT_BALANCE',''],['GROUP_WALLET_AD_GATE_CLOSED','']])('refuses before any ad request when the session is refused with %s',async(code)=>{
 sessionRefusal.code=code;const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByRole('alert');expect(rewardedAd.requests).toBe(0);expect(writes).toEqual([]);expect(sessionStorage.length).toBe(0);
});

const issued=()=>(globalThis.fetch as unknown as {mock:{calls:unknown[][]}}).mock.calls.filter(call=>call[0]==='/api/me/wallet/ad-session').length;
it('does not issue another session after unsupported appeared in the same dialog, and keeps the same error',async()=>{
 rewardedAd.outcome='unsupported';const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('이 기기나 브라우저에서는 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.');expect(issued()).toBe(1);
 fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('이 기기나 브라우저에서는 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.');expect(issued()).toBe(1);expect(rewardedAd.requests).toBe(1);
});
it('retries a session after no-fill as before',async()=>{
 rewardedAd.outcome='no-fill';const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.');
 fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await vi.waitFor(()=>expect(issued()).toBe(2));
});
it('sends the ticket target in the exchange body through the real dialog',async()=>{
 const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST'&&url==='/api/me/wallet/exchange'){const body=JSON.parse(init.body as string);bodies.push(body);return Response.json(receipt(body.requestKey));}return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('교환했어요');expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({target:'ticket',units:1,policyVersion:'group-wallet-v1',adSessionId:sessionIds.current});
});

// Quantity: N picks N ads and N one-unit exchanges, in order.
const bigWallet=(extra:object={})=>({...wallet,points:1000,...extra});
const runStubs=(data:object,onExchange?:(n:number)=>Response|void)=>{const posts:string[]=[],bodies:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){posts.push(url);if(url==='/api/me/wallet/exchange'){const body=JSON.parse(init.body as string);bodies.push(body);const custom=onExchange?.(bodies.length);if(custom)return custom;return Response.json(receipt(body.requestKey));}}return Response.json(url.endsWith('/history')?{entries:[]}:data);}));return {posts,bodies};};
const qtyGroup=()=>screen.getByRole('group',{name:'수량'});
it('caps the maximum by points and the remaining daily exchanges and prices the total from the API cost',async()=>{
 runStubs(bigWallet({exchangesRemainingToday:3}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'최대'}));
 expect(qtyGroup().querySelector('output')).toHaveTextContent('3');expect(screen.getByText('300 P')).toBeInTheDocument();expect(screen.getByRole('button',{name:'수량 늘리기'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'수량 줄이기'}));expect(screen.getByText('200 P')).toBeInTheDocument();
});
it('uses the points-based maximum when the remaining count is absent and blocks a shortage',async()=>{
 runStubs(bigWallet({points:450}));
 const view=render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'최대'}));expect(qtyGroup().querySelector('output')).toHaveTextContent('4');view.unmount();
 runStubs(bigWallet({points:99}));render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);
 expect(await screen.findByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();expect(screen.queryByRole('group',{name:'수량'})).toBeNull();
});
it('runs N ads and N one-unit exchanges in order and announces progress',async()=>{
 const {posts,bodies}=runStubs(bigWallet());
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));
 fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('+3 장');expect(screen.getByText('교환했어요')).toBeInTheDocument();
 expect(bodies).toHaveLength(3);expect(new Set(bodies.map(b=>b.requestKey)).size).toBe(3);expect(bodies.every(b=>b.units===1&&b.target==='ticket'&&typeof b.adSessionId==='string')).toBe(true);
 expect(issued()).toBe(3);expect(rewardedAd.requests).toBe(3);expect(posts).toEqual(Array(3).fill('/api/me/wallet/exchange'));
 fireEvent.click(screen.getByRole('button',{name:'확인'}));
});
it('stops at the count received when an ad is cancelled and keeps those units',async()=>{
 const {bodies}=runStubs(bigWallet(),n=>{if(n===1)rewardedAd.outcome='cancelled';});
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'최대'}));fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('광고 시청이 완료되지 않았어요. 멈춘 광고분은 포인트가 차감되지 않았어요.');
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');expect(screen.getByText('1/10')).toBeInTheDocument();expect(bodies).toHaveLength(1);expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).not.toBeDisabled();
});
it('stops on the daily limit mid-run and does not issue further sessions',async()=>{
 const {bodies}=runStubs(bigWallet(),n=>{if(n===1)sessionRefusal.code='GROUP_WALLET_AD_DAILY_LIMIT';});
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('오늘은 더 교환할 수 없어요.');expect(screen.queryByText(/차감되지 않았어요/)).toBeNull();
 expect(screen.getByText('1/3')).toBeInTheDocument();expect(bodies).toHaveLength(1);expect(issued()).toBe(2);
});
it('holds an unconfirmed exchange mid-run without another ad or exchange',async()=>{
 const {bodies}=runStubs(bigWallet(),()=>{throw new Error('network');});
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('전환 결과를 확인해 주세요');
 expect(bodies).toHaveLength(1);expect(issued()).toBe(1);expect(rewardedAd.requests).toBe(1);
});

it('does not wait for a close that never comes when the first session is already granted',async()=>{
 grantedFirst.left=1;const {bodies}=runStubs(bigWallet());
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await screen.findByText('+2 장');
 expect(bodies).toHaveLength(2);expect(rewardedAd.requests).toBe(1);expect(new Set(bodies.map(b=>b.requestKey)).size).toBe(2);
});
it('stops the run and unlocks the form when the ad never closes after the reward',async()=>{
 vi.useFakeTimers({shouldAdvanceTime:true});
 try{
  rewardedAd.noClose=true;const {bodies}=runStubs(bigWallet());
  render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
  fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
  await vi.waitFor(()=>expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1'));
  expect(rewardedAd.requests).toBe(1);
  await act(async()=>{vi.advanceTimersByTime(119000);});
  expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).toBeDisabled();
  await act(async()=>{vi.advanceTimersByTime(1000);});
  expect(rewardedAd.requests).toBe(1);expect(bodies).toHaveLength(1);expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1');
  expect(screen.getByRole('button',{name:'광고 보고 교환하기'})).not.toBeDisabled();
 }finally{vi.useRealTimers();}
});
it('prices the stopped state from the live balance and resets the quantity',async()=>{
 const {bodies}=runStubs(bigWallet(),n=>{if(n===1)rewardedAd.outcome='cancelled';});
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);await screen.findByRole('group',{name:'수량'});
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));expect(screen.getByText('300 P')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'광고 보고 교환하기'}));
 await vi.waitFor(()=>expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1'));
 await vi.waitFor(()=>expect(qtyGroup().querySelector('output')).toHaveTextContent('1'));
 expect(screen.getByText('100 P')).toBeInTheDocument();expect(screen.queryByText('300 P')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'수량 늘리기'}));expect(screen.getByText('200 P')).toBeInTheDocument();
});

const historyRows=(count:number)=>Array.from({length:count},(_,i)=>({id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,asset:'fan_point',amount:i+1,sourceType:'group_check_in',sourceId:id,celebrityId:null,createdAt:`2026-11-0${(i%5)+1}T01:00:00.000Z`}));
it('previews five history rows, expands from the title row, and opens expanded from #wallet-history',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:historyRows(8)}:wallet)));
 window.location.hash='';
 const view=render(<WalletHistoryPanel locale='ko' preview={{rows:5,moreLabel:'전체 보기',lessLabel:'접기'}}/>);
 await screen.findAllByText('출석체크');expect(view.container.querySelectorAll('li')).toHaveLength(5);
 expect(document.getElementById('wallet-history')!.parentElement!.querySelector('button')).toHaveTextContent('전체 보기');
 fireEvent.click(screen.getByRole('button',{name:'전체 보기'}));expect(view.container.querySelectorAll('li')).toHaveLength(8);
 fireEvent.click(screen.getByRole('button',{name:'접기'}));expect(view.container.querySelectorAll('li')).toHaveLength(5);fireEvent.click(screen.getByRole('button',{name:'전체 보기'}));
 view.unmount();
 window.location.hash='#wallet-history';
 const hashed=render(<WalletHistoryPanel locale='ko' preview={{rows:5,moreLabel:'전체 보기',lessLabel:'접기'}}/>);
 await screen.findAllByText('출석체크');await act(async()=>{});expect(hashed.container.querySelectorAll('li')).toHaveLength(8);
 window.location.hash='';
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
it('opens the ad with the one exchange press and blocks the form until the result',async()=>{
 const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){writes.push(url);const body=JSON.parse(init.body as string);return Response.json({...receipt(body.requestKey),target:'ticket'});}return Response.json(url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletExchangeDialog locale='ko' open onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'광고 보고 교환하기'}));
 expect(screen.queryByRole('button',{name:'광고 보기'})).toBeNull();
 await screen.findByText('교환했어요');expect(writes).toEqual(['/api/me/wallet/exchange']);expect(screen.queryByRole('button',{name:'광고 보고 교환하기'})).toBeNull();
});
