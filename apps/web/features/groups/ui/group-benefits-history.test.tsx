import {configure,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {GroupBenefitsScreen} from './group-benefits-screen';
import {groupByDay} from '@/features/group-wallet/ui/wallet-screen';
import {clearResources} from '@/components/fan-ui/resource-cache';

configure({defaultHidden:true});
vi.mock('@/features/group-wallet/ui/google-rewarded-ad',()=>({rewardedAdUnit:()=>undefined}));
// A signed-in member without a favorite ('empty'); 'guest' is the signed-out answer and puts the whole tab behind the login gate (사용자 11/13 11:2x).
const bias=vi.hoisted(()=>({status:'empty' as 'empty'|'guest'}));
vi.mock('@/features/selected-bias/ui/use-selected-bias',()=>({useSelectedBias:()=>({status:bias.status,options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}})}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=>'synthetic-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:any)=><div>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
const guid=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const entry=(n:number,amount:number,sourceType:string,createdAt:string,asset='fan_point')=>({id:guid(n),asset,amount,sourceType,sourceId:guid(100+n),celebrityId:null,createdAt});
const requests:string[]=[];
beforeEach(()=>{
 clearResources();requests.length=0;auth.ready=true;auth.authenticated=true;session.ready=true;bias.status='empty';
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{requests.push(url);
  if(url.endsWith('/api/me/wallet/history'))return Response.json({entries:[entry(1,10,'group_check_in','2026-11-09T01:00:00.000Z'),entry(2,-100,'group_exchange','2026-11-09T02:00:00.000Z'),entry(3,5,'group_check_in','2026-11-08T01:00:00.000Z')]});
  return new Response('{}',{status:404});}));
});
it('anchor contract: the history tabs link to /my/wallet, which renders the history; /benefits carries its own #wallet-history section',async()=>{
 const src=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
 // E2E a420865d9: /my/wallet shows the real history (no redirect for it), and the tabs point there.
 expect(src('../../../app/my/wallet/page.tsx')).toContain('<WalletScreen');
 expect(src('../../../app/my/wallet/page.tsx')).not.toContain('#wallet-history');
 expect(src('../../groups/ui/history-tabs.tsx')).toContain('/my/wallet?locale=${locale}');
 render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText('출석체크');
 expect(document.getElementById('wallet-history')).not.toBeNull();
});
it('rows: earn and spend, grouped by day, signed tabular amounts',async()=>{
 const view=render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText('출석체크');
 const amounts=[...view.container.querySelectorAll('[data-tone]')];
 expect(amounts.map(node=>node.getAttribute('data-tone'))).toEqual(['earn','spend','earn']);
 expect(amounts[0].textContent).toContain('+10');expect(amounts[1].textContent).toContain('-100');
 expect(view.container.querySelectorAll('h3 time')).toHaveLength(2);
});
it('groupByDay splits at Seoul midnight and keeps order',()=>{
 const days=groupByDay([{createdAt:'2026-11-09T14:59:00Z'},{createdAt:'2026-11-09T15:01:00Z'}],'ko');
 expect(days.map(day=>day.key)).toEqual(['2026-11-09','2026-11-10']);
});
it('access control: signed out is the login gate — no 내역 section, one sign-in action, and the ledger is never requested',()=>{
 auth.ready=false;auth.authenticated=false;session.ready=false;bias.status='guest';
 const view=render(<GroupBenefitsScreen locale='ko' signedOut/>);
 expect(view.container.querySelector('[data-login-gate]')).not.toBeNull();
 expect(document.getElementById('wallet-history')).toBeNull();
 expect(view.container.querySelectorAll('a[href^="/login"]')).toHaveLength(1);
 expect(requests.some(url=>url.includes('/api/me/wallet/history'))).toBe(false);
});
it('empty state keeps the card and offers one 오늘의 덕질 action',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/api/me/wallet/history')?Response.json({entries:[]}):new Response('{}',{status:404})));
 const view=render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('아직 내역이 없어요');
 expect(view.container.querySelector('a[href="/my?locale=ko"]')).toHaveTextContent('오늘의 덕질');
});
