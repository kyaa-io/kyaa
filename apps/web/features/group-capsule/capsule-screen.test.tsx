import {beforeAll,afterAll} from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@/i18n/locales';
import { CapsuleScreen,capsuleRecoveryCopy } from './capsule-screen';
import { canDraw, capsuleResultSchema, capsuleSchema } from './domain';
import { capsuleCopy } from './copy';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token-a')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppFrame:({children}:{children:React.ReactNode})=><div>{children}</div>,FanContentContainer:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('@/features/groups/ui/group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001',prizeId='10000000-0000-4000-8000-000000000002';
const campaign={id,name:'엔카이브 캡슐',status:'active' as const,blankWeight:900000,weightTotal:1000000 as const,prizes:[{id:prizeId,name:'포토 카드',imageUrl:null,stock:20,weight:100000}]};
const wallet={sequence:1,points:100,hearts:1,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}};
beforeEach(()=>{session.ownerId='owner-a';session.generation=0;auth.authenticated=true;sessionStorage.clear();});
it('renders the source game controls without preview overrides',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:{items:[campaign]})));
 const view=render(<CapsuleScreen locale='ko'/>);await screen.findByRole('heading',{name:campaign.name});
 expect(view.container.querySelector('.lucide-ticket')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'응모권 1장으로 뽑기'}).querySelector('.lucide-arrow-right')).toBeInTheDocument();
});
it('validates published probabilities and disables a batch that could exhaust stock',()=>{expect(capsuleSchema.safeParse({...campaign,blankWeight:1}).success).toBe(false);expect(canDraw(campaign,10,10)).toBe(true);expect(canDraw({...campaign,prizes:[{...campaign.prizes[0],stock:9}]},10,10)).toBe(false);expect(canDraw({...campaign,status:'paused'},1,10)).toBe(false);expect(canDraw(campaign,1,0)).toBe(false);});
it('requires one result for every committed draw including blanks',()=>{expect(capsuleResultSchema.safeParse({requestKey:id,campaignId:id,count:10,results:[{index:1,prizeId:null,name:null,imageUrl:null}],tickets:0}).success).toBe(false);});
it('has complete capsule labels in every supported locale',()=>{for(const locale of APP_LOCALES)expect(Object.values(capsuleCopy(locale)).every(x=>typeof x==='string'&&x.length>0)).toBe(true);});
it('recovers a lost response after reload without submitting another draw',async()=>{
 let input:{requestKey:string;count:number}|undefined;const requests:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{requests.push(`${init?.method??'GET'} ${url}`);if(url==='/api/groups/capsules')return Response.json({items:[campaign]});if(url==='/api/me/wallet')return Response.json(wallet);if(url.endsWith('/draw')){input=JSON.parse(init!.body as string);throw new TypeError('offline');}if(url.includes('/capsule-requests/'))return Response.json({requestKey:input!.requestKey,campaignId:id,count:1,results:[{index:1,prizeId:null,name:null,imageUrl:null}],tickets:11});throw new Error(url);}));
 const view=render(<CapsuleScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'응모권 1장으로 뽑기'}));await screen.findByRole('button',{name:'결과 확인'});view.unmount();render(<CapsuleScreen locale='ko'/>);const recover=await screen.findByRole('button',{name:'결과 확인'});expect(screen.getByRole('radio',{name:'10회 뽑기'})).toBeDisabled();fireEvent.click(recover);expect(await screen.findByRole('heading',{name:'캡슐을 열고 있어요'})).toBeInTheDocument();expect(requests.filter(x=>x.startsWith('POST '))).toHaveLength(1);expect(sessionStorage.length).toBe(0);
});
it('stores the request before sending a ticket-consuming mutation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(url==='/api/groups/capsules')return Response.json({items:[campaign]});if(url==='/api/me/wallet')return Response.json(wallet);const input=JSON.parse(init!.body as string);expect(JSON.parse(sessionStorage.getItem('kyaa-capsule-pending:owner-a')!)).toEqual({campaignId:id,...input});return Response.json({requestKey:input.requestKey,campaignId:id,count:1,results:[{index:1,prizeId,name:'포토 카드',imageUrl:null}],tickets:11});}));render(<CapsuleScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'응모권 1장으로 뽑기'}));await waitFor(()=>expect(screen.getByRole('heading',{name:'캡슐을 열고 있어요'})).toBeInTheDocument());
});
it('loads campaigns beyond the first cursor page',async()=>{
 const second='10000000-0000-4000-8000-000000000003';const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(url==='/api/me/wallet'?wallet:url.includes('cursor=')?{items:[{...campaign,id:second,name:'다음 캠페인'}],nextCursor:null}:{items:[campaign],nextCursor:id});}));
 render(<CapsuleScreen locale='ko'/>);await screen.findByRole('heading',{name:campaign.name});fireEvent.click(screen.getByRole('button',{name:'더 보기'}));await screen.findByRole('heading',{name:'다음 캠페인'});expect(screen.getByRole('heading',{name:campaign.name})).toBeInTheDocument();expect(urls.some(url=>url.includes(`cursor=${id}`))).toBe(true);
});

it.each([['GROUP_WALLET_INSUFFICIENT_BALANCE','응모권이 부족해요.'],['CAPSULE_SOLD_OUT','지금은 참여할 수 없어요.']])('separates definite %s rejection from uncertain receipts',async(code,label)=>{
 let posts=0;vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(url==='/api/groups/capsules')return Response.json({items:[campaign]});if(url==='/api/me/wallet')return Response.json(wallet);expect(init?.method).toBe('POST');posts++;return Response.json({error:{code}},{status:409});}));
 render(<CapsuleScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'응모권 1장으로 뽑기'}));await screen.findByText(label);
 expect(screen.queryByRole('button',{name:'결과 확인'})).not.toBeInTheDocument();expect(screen.queryByText(/결과 확인이 필요해요/)).not.toBeInTheDocument();expect(sessionStorage.length).toBe(0);expect(posts).toBe(1);
});

it('provides complete source recovery labels in every supported locale',()=>{for(const locale of APP_LOCALES)expect(Object.values(capsuleRecoveryCopy(locale)).every(value=>value.trim().length>0)).toBe(true);});
it('replays the same validated receipt locally without another read, draw or reward request',async()=>{
 const originalScroll=Object.getOwnPropertyDescriptor(Element.prototype,'scrollIntoView');Object.defineProperty(Element.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
 try{
  sessionStorage.setItem('kyaa-capsule-pending:owner-a',JSON.stringify({campaignId:id,requestKey:prizeId,count:1}));const requests:string[]=[];
  const result={requestKey:prizeId,campaignId:id,count:1,results:[{index:1,prizeId:null,name:null,imageUrl:null}],tickets:11};
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{requests.push(`${init?.method??'GET'} ${url}`);if(url==='/api/groups/capsules')return Response.json({items:[campaign]});if(url==='/api/me/wallet')return Response.json(wallet);if(url.includes('/capsule-requests/'))return Response.json(result);throw new Error('No further request allowed');}));
  const view=render(<CapsuleScreen locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'결과 확인'}));await screen.findByRole('heading',{name:'이전 뽑기 결과가 있어요'});
  const recovery=view.container.querySelector('[data-source-state="es3y5"]')!;expect(recovery.querySelector('.lucide-history')).toHaveAttribute('width','32');expect(screen.getByRole('button',{name:'이전 결과 보기'})).toBeInTheDocument();
  fireEvent.ended(view.container.querySelector('video')!);await waitFor(()=>expect(view.container.querySelector('[data-capsule-phase]')).toHaveAttribute('data-capsule-phase','3'),{timeout:3000});const before=view.container.querySelector('#capsule-confirmed-result')!.textContent;const beforeReplay=[...requests];
  fireEvent.click(screen.getByRole('button',{name:'연출 다시 보기'}));expect(view.container.querySelector('[data-capsule-phase]')).toHaveAttribute('data-capsule-phase','0');expect(requests).toEqual(beforeReplay);
  fireEvent.ended(view.container.querySelector('video')!);await waitFor(()=>expect(view.container.querySelector('[data-capsule-phase]')).toHaveAttribute('data-capsule-phase','3'),{timeout:3000});expect(view.container.querySelector('#capsule-confirmed-result')!.textContent).toBe(before);expect(requests).toEqual(beforeReplay);expect(requests.filter(request=>request.startsWith('POST '))).toEqual([]);expect(requests.filter(request=>request.includes('/capsule-requests/'))).toHaveLength(1);expect(sessionStorage.length).toBe(0);
 }finally{if(originalScroll)Object.defineProperty(Element.prototype,'scrollIntoView',originalScroll);else Reflect.deleteProperty(Element.prototype,'scrollIntoView');}
},10000);

const dialogPrototype=HTMLDialogElement.prototype,originalShowModal=Object.getOwnPropertyDescriptor(dialogPrototype,'showModal'),originalClose=Object.getOwnPropertyDescriptor(dialogPrototype,'close');
beforeAll(()=>{Object.defineProperty(dialogPrototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(dialogPrototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(originalShowModal)Object.defineProperty(dialogPrototype,'showModal',originalShowModal);else Reflect.deleteProperty(dialogPrototype,'showModal');if(originalClose)Object.defineProperty(dialogPrototype,'close',originalClose);else Reflect.deleteProperty(dialogPrototype,'close');});

it('commits one draw on repeated clicks, retains a closed receipt, and clears it on owner change',async()=>{
 let posts=0;let finish:()=>void=()=>{};
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/groups/capsules')return Response.json({items:[campaign]});
  if(url==='/api/me/wallet')return Response.json(wallet);
  const input=JSON.parse(init!.body as string);posts++;await new Promise<void>(resolve=>{finish=resolve;});
  return Response.json({requestKey:input.requestKey,campaignId:id,count:1,results:[{index:1,prizeId:null,name:null,imageUrl:null}],tickets:11});
 }));
 const view=render(<CapsuleScreen locale='ko'/>);const draw=await screen.findByRole('button',{name:'응모권 1장으로 뽑기'});fireEvent.click(draw);fireEvent.click(draw);
 await waitFor(()=>expect(posts).toBe(1));finish();fireEvent.click(await screen.findByRole('button',{name:'결과 바로 보기'}));await screen.findByRole('dialog');
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'뽑기 결과'}));expect(screen.getByText('11장')).toBeInTheDocument();expect(posts).toBe(1);
 session.ownerId='owner-b';session.generation++;view.rerender(<CapsuleScreen locale='ko'/>);
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.queryByRole('button',{name:'뽑기 결과'})).not.toBeInTheDocument();expect(posts).toBe(1);
});
