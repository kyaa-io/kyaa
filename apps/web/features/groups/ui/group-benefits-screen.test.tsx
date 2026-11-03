import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {GroupBenefitsScreen} from './group-benefits-screen';
import {groupBenefitsCopy} from './group-benefits-copy';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'synthetic-token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:any)=><div>{children}</div>,FanContentContainer:({children}:any)=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
const wallet={sequence:1,points:137,hearts:3,tickets:7,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}};
const raffle={id,pageId:id,pageName:'Actual page',title:'First raffle',description:'Original description',imageUrl:null,href:`/pages/groups/${id}/raffles/${id}`,status:'open',closesAt:'2100-12-31T00:00:00Z'};
let fail=false,empty=false,invalidCursor=false;
const requests:string[]=[];
beforeEach(()=>{fail=false;empty=false;invalidCursor=false;requests.length=0;auth.authenticated=true;session.ownerId='owner-a';session.generation=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  expect(init?.method??'GET').toBe('GET');requests.push(url);
  if(url==='/api/me/wallet')return Response.json(wallet);
  if(url.includes('/api/public/celebrities'))return Response.json({celebrities:[{slug:'synthetic-creator',name:'Actual creator'}]});
  const q=new URL(url,'https://local.test').searchParams,kind=q.get('kind');
  if(invalidCursor&&q.has('cursor'))return Response.json({error:{code:'GROUP_BENEFITS_NOT_FOUND'}},{status:404});
  if(fail)return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
  if(empty)return Response.json({kind,items:[],nextCursor:null});
  if(kind==='missions')return Response.json({kind,items:[{id,pageId:id,pageName:'Actual page',title:'Survey',description:'Original question',imageUrl:null,href:`/pages/groups/${id}/missions/${id}`,status:'published',submissionKind:'survey',rewardPoints:0}],nextCursor:null});
  return Response.json({kind,items:[q.has('cursor')?{...raffle,id:second,title:'Second raffle'}:raffle],nextCursor:q.has('cursor')?null:id});
 }));
});
it('uses validated wallet/catalog values, real scoped links, zero rewards and independent cursor pages',async()=>{
 render(<GroupBenefitsScreen locale='ja'/>);
 await screen.findByText('137 P');await screen.findByText('First raffle');await screen.findByText('Survey');
 expect(screen.getByText(/0 P/)).toBeInTheDocument();
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ja').lucky});
 expect(within(section).getAllByRole('link').some(link=>link.getAttribute('href')===`${raffle.href}?locale=ja`)).toBe(true);
 fireEvent.click(within(section).getByRole('button'));
 await screen.findByText('Second raffle');expect(screen.getByText('First raffle')).toBeInTheDocument();
 expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
 expect(screen.getByRole('link',{name:'ハートを送る'})).toHaveAttribute('href','/my/wallet?view=support&creator=synthetic-creator&locale=ja');
});
it('distinguishes errors from empty and retries the failing catalog',async()=>{
 fail=true;render(<GroupBenefitsScreen locale='ko'/>);await screen.findAllByRole('alert');
 expect(screen.queryByText(groupBenefitsCopy('ko').empty)).not.toBeInTheDocument();
 fail=false;fireEvent.click(within(screen.getAllByRole('alert')[0]).getByRole('button'));await screen.findByText('First raffle');
});
it('does not request private balances for guests',async()=>{
 auth.authenticated=false;empty=true;render(<GroupBenefitsScreen locale='ko'/>);
 await screen.findAllByText(groupBenefitsCopy('ko').empty);expect(requests).not.toContain('/api/me/wallet');
 expect(screen.getByRole('link',{name:'로그인'})).toHaveAttribute('href',expect.stringContaining('returnTo='));
});
it('restarts a catalog whose cursor anchor is no longer available',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');
 invalidCursor=true;fireEvent.click(screen.getByRole('button',{name:'더 보기'}));
 const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');empty=true;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));
 await within(section).findByText(groupBenefitsCopy('ko').empty);
 expect(screen.queryByText('First raffle')).toBeNull();expect(requests).toContain('/api/groups/benefits?kind=raffles');
 expect(requests.some(url=>url.includes('cursor='))).toBe(false);
});
it('keeps the same cursor and accumulated entries on a transient error',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');fail=true;
 fireEvent.click(screen.getByRole('button',{name:'더 보기'}));const section=screen.getByRole('region',{name:groupBenefitsCopy('ko').lucky});
 await within(section).findByRole('alert');fail=false;requests.length=0;
 fireEvent.click(within(section).getByRole('button',{name:'다시 시도'}));await screen.findByText('Second raffle');
 expect(screen.getByText('First raffle')).toBeInTheDocument();expect(requests).toContain(`/api/groups/benefits?kind=raffles&cursor=${id}`);
});

it('drops accumulated pages immediately when the owner changes',async()=>{
 const view=render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('First raffle');fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByText('Second raffle');
 empty=true;session.ownerId='owner-b';session.generation++;
 view.rerender(<GroupBenefitsScreen locale='ko'/>);expect(screen.queryByText('First raffle')).not.toBeInTheDocument();expect(screen.queryByText('Second raffle')).not.toBeInTheDocument();await screen.findAllByText(groupBenefitsCopy('ko').empty);
});
it('refreshes balances after the shared wallet mutation event',async()=>{
 render(<GroupBenefitsScreen locale='ko'/>);await screen.findByText('137 P');requests.length=0;
 await act(async()=>window.dispatchEvent(new Event('kyaa:group-wallet-changed')));
 expect(requests).toContain('/api/me/wallet');
});
it('has complete localized interface labels',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupBenefitsCopy(locale)).every(value=>value.trim())).toBe(true);});
