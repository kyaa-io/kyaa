import {configure,render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {GroupBenefitsScreen} from './group-benefits-screen';
import {groupByDay} from '@/features/group-wallet/ui/wallet-screen';
import {clearResources} from '@/components/fan-ui/resource-cache';

configure({defaultHidden:true});
vi.mock('@/features/group-wallet/ui/google-rewarded-ad',()=>({rewardedAdUnit:()=>undefined}));
vi.mock('@/features/selected-bias/ui/use-selected-bias',()=>({useSelectedBias:()=>({status:'guest',options:[],selected:null,unverified:null,select:()=>{},retry:()=>{}})}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=>'synthetic-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:any)=><div>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
const guid=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const entry=(n:number,amount:number,sourceType:string,createdAt:string,asset='fan_point')=>({id:guid(n),asset,amount,sourceType,sourceId:guid(100+n),celebrityId:null,createdAt});
const requests:string[]=[];
beforeEach(()=>{
 clearResources();requests.length=0;auth.ready=true;auth.authenticated=true;session.ready=true;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{requests.push(url);
  if(url.endsWith('/api/me/wallet/history'))return Response.json({entries:[entry(1,10,'group_check_in','2026-11-09T01:00:00.000Z'),entry(2,-100,'group_exchange','2026-11-09T02:00:00.000Z'),entry(3,5,'group_check_in','2026-11-08T01:00:00.000Z')]});
  return new Response('{}',{status:404});}));
});
it('anchor contract: every wallet-history link points at /benefits and the section carries id wallet-history',async()=>{
 const src=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
 expect(src('../../../app/my/wallet/page.tsx')).toContain('/benefits?locale=${parseAppLocale(query.locale)}#wallet-history');
 expect(src('../../groups/ui/history-tabs.tsx')).toContain('/benefits?locale=${locale}#wallet-history');
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
it('access control: signed out shows the sign-in action and never requests the ledger',()=>{
 auth.ready=false;auth.authenticated=false;session.ready=false;
 const view=render(<GroupBenefitsScreen locale='ko' signedOut/>);
 expect(document.getElementById('wallet-history')).not.toBeNull();
 expect(view.container.querySelectorAll('a[href^="/login"]').length).toBeGreaterThanOrEqual(2);
 expect(requests.some(url=>url.includes('/api/me/wallet/history'))).toBe(false);
});
it('empty state keeps the card and offers one 오늘의 덕질 action',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/api/me/wallet/history')?Response.json({entries:[]}):new Response('{}',{status:404})));
 const view=render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findByText('아직 내역이 없어요');
 expect(view.container.querySelector('a[href="/my?locale=ko"]')).toHaveTextContent('오늘의 덕질');
});
