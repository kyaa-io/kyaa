import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WalletScreen } from './wallet-screen';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('./google-rewarded-ad',()=>({rewardedAdUnit:()=>undefined,loadRewardedGpt:async()=>({}),requestRewardedAd:()=>({show:()=>true,cancel:()=>{}})}));
const routeReplace=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({replace:routeReplace})}));
const wallet={sequence:1,points:240,hearts:2,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-02',checkedIn:false,streak:6,nextBonusIn:1}};
const id='10000000-0000-4000-8000-000000000001';
const serve=(attendance:Record<string,unknown>,extra:Record<string,unknown>={})=>vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/history')?Response.json({entries:[]}):Response.json({...wallet,...extra,attendance:{...wallet.attendance,...attendance}})));
beforeEach(()=>{sessionStorage.clear();auth.ready=true;auth.authenticated=true;});
it('day one: first-stamp title and a single 10P action',async()=>{
 serve({streak:0,nextBonusIn:7});render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:'오늘 출석하고 10P 받기'})).toBeEnabled();expect(screen.getByRole('heading',{name:'오늘 첫 도장을 찍어요'})).toBeInTheDocument();expect(screen.queryByText('오늘 출석 완료')).toBeNull();
});
it('mid streak: 10P action and no completion row',async()=>{
 serve({streak:3,nextBonusIn:4});render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:'오늘 출석하고 10P 받기'})).toBeEnabled();expect(screen.getByRole('heading',{name:'3일 연속 출석 중'})).toBeInTheDocument();expect(screen.queryByRole('status')).toBeNull();
});
it('before the seventh stamp: 30P action and the seventh-day hint',async()=>{
 serve({});render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'})).toBeEnabled();expect(screen.getByText('오늘 일곱 번째 도장을 찍어요')).toBeInTheDocument();
});
it('already done: says completion and the actual points once, offers only the record link',async()=>{
 serve({checkedIn:true,streak:7,nextBonusIn:7,days:[{date:'2026-11-02',points:30}]});render(<WalletScreen locale='ko' attendance/>);
 const status=(await screen.findByText('오늘 출석 완료')).closest('p')!;expect(status).toHaveAttribute('role','status');expect(status).toHaveTextContent('+30P');
 expect(screen.getAllByText(/오늘 출석 완료/)).toHaveLength(1);expect(screen.queryByText('완료했어요.')).toBeNull();expect(screen.queryByText(/출석하고 10P 받기/)).toBeNull();
 expect(screen.queryByRole('button',{name:/오늘 출석/})).toBeNull();expect(screen.getByRole('link',{name:'내 출석 기록 보기'})).toHaveAttribute('href',expect.stringContaining('#attendance-record'));
});
it('right after the response: completion row carries the refreshed balance, no duplicate success card',async()=>{
 let checked=false;vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet/check-in'){checked=true;return Response.json({requestKey:JSON.parse(init!.body as string).requestKey,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  return Response.json({...wallet,points:checked?270:240,attendance:{...wallet.attendance,checkedIn:checked,streak:checked?7:6,nextBonusIn:checked?7:1,days:checked?[{date:'2026-11-02',points:30}]:[]}});
 }));
 render(<WalletScreen locale='ko' attendance/>);fireEvent.click(await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'}));
 const status=await screen.findByText('포인트 270 P');expect(status.closest('p')).toHaveTextContent('+30P');expect(screen.queryByText('완료했어요.')).toBeNull();expect(screen.getAllByRole('status')).toHaveLength(1);
});
it('wallet error shows one alert with retry; guest sees login only',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:500})));render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('alert')).toBeInTheDocument();expect(screen.getByRole('button',{name:'잔액 다시 확인'})).toBeInTheDocument();
});
it('guest: login link and no check-in button',async()=>{
 auth.authenticated=false;serve({});render(<WalletScreen locale='ko' attendance/>);
 expect(await screen.findByRole('link',{name:/로그인/})).toBeInTheDocument();expect(screen.queryByRole('button',{name:/오늘 출석/})).toBeNull();
});
it('pending title and record label exist for every locale and never repeat the pending sentence',async()=>{
 const {APP_LOCALES}=await import('@/i18n/locales');const {walletPendingTitle,attendanceRecordLabel}=await import('./attendance-copy');const {walletCopy}=await import('./copy');
 for(const locale of APP_LOCALES){expect(walletPendingTitle(locale).trim()).not.toBe('');expect(walletPendingTitle(locale)).not.toBe(walletCopy(locale).pending);expect(attendanceRecordLabel(locale).trim()).not.toBe('');}
});
it('check-in transition never shows the before state again after the POST and keeps the balance in the same frame as the done view',async()=>{
 let checked=false,release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet/check-in'){checked=true;return Response.json({requestKey:JSON.parse(init!.body as string).requestKey,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  if(checked)await gate;
  return Response.json({...wallet,points:checked?270:240,attendance:{...wallet.attendance,checkedIn:checked,streak:checked?7:6,nextBonusIn:checked?7:1,days:checked?[{date:'2026-11-02',points:30}]:[]}});
 }));
 render(<WalletScreen locale='ko' attendance/>);const button=await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'});
 const frames:string[]=[];const snap=()=>frames.push(`${screen.queryByText('출석을 확인하고 있어요')?'panel':''}|${screen.queryByText('오늘 출석 완료')?'done':''}|${screen.queryByText(/포인트 270 P/)?'balance':''}|${screen.queryByRole('button',{name:/오늘 출석하고/})?.hasAttribute('disabled')?'locked':screen.queryByRole('button',{name:/오늘 출석하고/})?'open':''}`);
 const observer=new MutationObserver(snap);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
 fireEvent.click(button);await new Promise(r=>setTimeout(r,50));snap();release();
 await screen.findByText('포인트 270 P');observer.disconnect();
 expect(frames.some(f=>f.startsWith('panel'))).toBe(false);
 const firstDone=frames.findIndex(f=>f.includes('done'));expect(firstDone).toBeGreaterThan(-1);
 expect(frames.slice(0,firstDone).filter(f=>f==='|||open').length).toBeLessThanOrEqual(1);
 expect(frames[firstDone]).toContain('balance');expect(frames.some(f=>f.endsWith('|locked'))).toBe(true);
 expect(screen.getByRole('link',{name:'내 출석 기록 보기'}).getAttribute('data-fan-action-emphasis')).toBeNull();
});
it('refetch failure after the POST does not leave the button locked and goes to the wallet error path',async()=>{
 let checked=false;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet/check-in'){checked=true;return Response.json({requestKey:JSON.parse(init!.body as string).requestKey,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  if(checked)return Response.json({error:{code:'GROUP_WALLET_UNAVAILABLE'}},{status:503});
  return Response.json({...wallet,attendance:{...wallet.attendance,days:[]}});
 }));
 render(<WalletScreen locale='ko' attendance/>);fireEvent.click(await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'}));
 const retry=await screen.findByRole('button',{name:'잔액 다시 확인'});
 expect(retry.hasAttribute('disabled')).toBe(false);expect(screen.getByRole('alert')).toBeTruthy();
 expect(screen.queryByRole('button',{name:/오늘 출석하고/})).toBeNull();
});
it('replayed check-in response completes like a fresh one and shows the refreshed balance',async()=>{
 let checked=false;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/me/wallet/check-in'){checked=true;return Response.json({requestKey:JSON.parse(init!.body as string).requestKey,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:true});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  return Response.json({...wallet,points:checked?270:240,attendance:{...wallet.attendance,checkedIn:checked,streak:checked?7:6,nextBonusIn:checked?7:1,days:checked?[{date:'2026-11-02',points:30}]:[]}});
 }));
 render(<WalletScreen locale='ko' attendance/>);fireEvent.click(await screen.findByRole('button',{name:'오늘 출석하고 30P 받기'}));
 expect(await screen.findByText('포인트 270 P')).toBeTruthy();expect(screen.getByText('오늘 출석 완료')).toBeTruthy();
 expect(screen.queryByRole('button',{name:/오늘 출석하고/})).toBeNull();
});
it('recover with a committed original request completes and shows the refreshed balance',async()=>{
 const key='20000000-0000-4000-8000-000000000002';let committed=false;
 sessionStorage.setItem('kyaa-wallet-pending:owner-a',JSON.stringify({operation:'check-in',requestKey:key}));
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url===`/api/me/wallet/requests/${key}`){committed=true;return Response.json({status:'committed',result:{requestKey:key,date:'2026-11-02',pointsAwarded:30,streak:7,ledgerId:id,replayed:false}});}
  if(url.endsWith('/history'))return Response.json({entries:[]});
  return Response.json({...wallet,points:committed?270:240,attendance:{...wallet.attendance,checkedIn:committed,streak:committed?7:6,nextBonusIn:committed?7:1,days:committed?[{date:'2026-11-02',points:30}]:[]}});
 }));
 const {walletCopy}=await import('./copy');
 render(<WalletScreen locale='ko' attendance/>);fireEvent.click(await screen.findByRole('button',{name:walletCopy('ko').recover}));
 expect(await screen.findByText('포인트 270 P')).toBeTruthy();expect(screen.getByText('오늘 출석 완료')).toBeTruthy();
 expect(sessionStorage.getItem('kyaa-wallet-pending:owner-a')).toBeNull();
});
