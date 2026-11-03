import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WalletScreen } from './wallet-screen';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001';
const wallet={sequence:1,points:240,hearts:2,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-02',checkedIn:false,streak:6,nextBonusIn:1}};
const receipt=(requestKey:string)=>({requestKey,target:'heart',units:1,pointsSpent:100,pointLedgerId:id,creditLedgerId:id,policyVersion:'group-wallet-v1',createdAt:'2026-11-02T00:00:00Z',replayed:false});
beforeEach(()=>sessionStorage.clear());
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
 const view=render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'교환하기'}));
 await screen.findByRole('button',{name:'처리 결과 확인'});view.unmount();render(<WalletScreen locale='ko'/>);
 fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByText('완료했어요.');
 expect(mutations).toEqual(['/api/me/wallet/exchange']);expect(sessionStorage.length).toBe(0);
});
it('shows the seventh-day reward and blocks exchanges beyond the balance',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 const view=render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'});
 expect(screen.getByRole('heading',{name:'도장 하나, 오늘의 기록'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'6일 연속 출석 중'})).toBeInTheDocument();
 expect(screen.getByText('오늘 일곱 번째 도장을 찍어요')).toBeInTheDocument();expect(screen.getByText('오늘 출석하면 10P + 보너스 20P')).toBeInTheDocument();expect(screen.getByText('일곱 번째 출석에는 기본 10P에 보너스까지')).toBeInTheDocument();
 view.rerender(<WalletScreen locale='ko'/>);await screen.findByRole('spinbutton');
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'3'}});
 expect(screen.getByRole('button',{name:'교환하기'})).toBeDisabled();
});
it('keeps legacy receipts pending instead of reposting them',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'heart',units:1,policyVersion:'group-wallet-v1'}));
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push(init?.method??'GET');return Response.json(url.includes('/requests/')?{status:'legacy',requiresOriginalContext:true}:url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByRole('heading',{name:'전환 결과를 확인해 주세요'});
 expect(calls).not.toContain('POST');expect(sessionStorage.length).toBe(1);
});

it('disables attendance before the configured reward start date',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}: {...wallet,rewardsStartOn:'2026-11-03'})));
 const view=render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:/부터 출석/})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'교환하기'})).not.toBeInTheDocument();
 view.rerender(<WalletScreen locale='ko'/>);
 expect(await screen.findByRole('button',{name:'교환하기'})).toBeEnabled();
});

it('recovers support with its original creator and request without sending hearts twice',async()=>{
 let key='';const writes:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.endsWith('/history'))return Response.json({entries:[]});
  if(url.includes('/resolve/'))return Response.json({page:{id,kind:'fan',celebrityId:id,slug:url.split('/').at(-1),name:url.endsWith('/elina')?'엘리나':'제니정',description:'',imageUrl:null,question:null,memberCount:12},membership:null,bookmarked:false});
  if(url.includes('/requests/'))return Response.json({status:'committed',result:{requestKey:key,celebrityId:id,units:1,voucherLedgerId:id,policyVersion:'group-wallet-v1',createdAt:'2026-11-02T00:00:00Z',replayed:false}});
  const body=JSON.parse(init!.body as string);writes.push(body);key=body.requestKey;throw new TypeError('Response lost');
 }));
 const view=render(<WalletScreen locale='ko' supportCreator='elina'/>);fireEvent.click(await screen.findByRole('button',{name:'하트 보내기'}));await screen.findByRole('button',{name:'처리 결과 확인'});view.unmount();render(<WalletScreen locale='ko' supportCreator='jenny'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByText('elina에게 응원을 보냈어요 · 1 하트');expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({celebritySlug:'elina',units:1,policyVersion:'group-wallet-v1'});expect(sessionStorage.length).toBe(0);
});

it('adjusts exchange quantity within the existing limits and recalculates the debit',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko'/>);
 const quantity=await screen.findByRole('spinbutton');
 expect(screen.getByRole('button',{name:'교환 수량 −'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'교환 수량 +'}));
 expect(quantity).toHaveValue(2);
 expect(screen.getByText('200 P')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'교환하기'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'교환 수량 +'}));
 expect(quantity).toHaveValue(3);
 expect(screen.getByRole('button',{name:'교환하기'})).toBeDisabled();
 fireEvent.change(quantity,{target:{value:'1000'}});
 expect(screen.getByRole('button',{name:'교환 수량 +'})).toBeDisabled();
 expect(screen.getByRole('link',{name:'추첨 보러 가기'})).toHaveAttribute('href','/benefits?locale=ko');
});

it('keeps source wallet balances while directing local conversion to benefits',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:wallet)));
 render(<WalletScreen locale='ko' localProfile={{nickname:'스타벅스라이프',avatarUrl:'/images/avatars/star-pink.webp'}} localPresentation={{benefitsHref:'/benefits',historyRows:[{label:'출석체크 · 오늘',value:'포인트 적립'}]}}/>);
 expect(await screen.findByRole('link',{name:'덕질에서 전환·사용'})).toHaveAttribute('href','/benefits');expect(screen.getByText('포인트는 덕질에서 사용해요')).toBeInTheDocument();expect(screen.getByText('응모권은 모임 전용과 Kyaa 공식으로 구분돼요.')).toBeInTheDocument();expect(screen.getByText('포인트 적립')).toBeInTheDocument();expect(screen.getAllByText('모임 응모권')).toHaveLength(2);expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'교환하기'})).not.toBeInTheDocument();
});
it('renders source balance failure from the real resource and retries the same read',async()=>{
 let reads=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url==='/api/me/wallet'){reads++;return reads===1?Response.json({error:{code:'UNAVAILABLE'}},{status:503}):Response.json(wallet);}return Response.json({entries:[]});}));
 const view=render(<WalletScreen locale='ko'/>);expect(await screen.findByRole('heading',{name:'잔액을 불러오지 못했어요'})).toBeInTheDocument();expect(view.container.querySelector('[data-source-state="QnIgR"]')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'잔액 다시 확인'}));await screen.findByRole('button',{name:'교환하기'});expect(reads).toBe(2);
});
it('shows only returned attendance points rather than the source example bonus',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/history')?{entries:[]}:{...wallet,attendance:{...wallet.attendance,checkedIn:true,days:[{date:wallet.attendance.date,points:10}]}})));
 const view=render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('heading',{name:'오늘 출석 완료'});const state=view.container.querySelector('[data-source-state="u8Qcg"]')!;expect(state).toHaveTextContent('10P');expect(state).not.toHaveTextContent('20P');expect(state).not.toHaveTextContent('30P');
});
it('holds an unknown conversion result without reposting or discarding the original request',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'heart',units:1,policyVersion:'group-wallet-v1'}));const writes:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST')writes.push(url);return Response.json(url.includes('/requests/')?{status:'unknown'}:url.endsWith('/history')?{entries:[]}:wallet);}));
 const view=render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByRole('heading',{name:'전환 결과를 확인해 주세요'});expect(view.container.querySelector('[data-source-state="VMiFI"]')).not.toBeNull();expect(screen.getByRole('link',{name:'교환 내역 확인'})).toHaveAttribute('href','/my/wallet?locale=ko#wallet-history');expect(screen.queryByRole('button',{name:'처리 결과 확인'})).not.toBeInTheDocument();expect(writes).toEqual([]);expect(JSON.parse(sessionStorage.getItem('kyaa-wallet-pending:owner-a')!).requestKey).toBe(id);expect(screen.getByRole('button',{name:'교환하기'})).toBeDisabled();
});
