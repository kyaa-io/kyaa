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
 const view=render(<WalletScreen locale='ko' attendance/>);await screen.findByRole('button',{name:'출석하고 30P 받기'});
 expect(screen.getByRole('heading',{name:'도장 하나, 오늘의 기록'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'6일 연속 출석'})).toBeInTheDocument();
 view.rerender(<WalletScreen locale='ko'/>);await screen.findByRole('spinbutton');
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'3'}});
 expect(screen.getByRole('button',{name:'교환하기'})).toBeDisabled();
});
it('keeps legacy receipts pending instead of reposting them',async()=>{
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'exchange',requestKey:id,target:'heart',units:1,policyVersion:'group-wallet-v1'}));
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push(init?.method??'GET');return Response.json(url.includes('/requests/')?{status:'legacy',requiresOriginalContext:true}:url.endsWith('/history')?{entries:[]}:wallet);}));
 render(<WalletScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'처리 결과 확인'}));await screen.findByText('요청을 완료하지 못했어요.');
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
