import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@/i18n/locales';
import { GroupRaffleScreen } from './raffle-screen';
import { raffleCopy } from './copy';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token-a')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('@/features/groups/ui/group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
const id='10000000-0000-4000-8000-000000000001';
const raffle={id,benefitId:id,title:'한강 러닝 굿즈',summary:'',imageUrl:null,winnerQuantity:2,status:'open',entryOpensAt:'2026-01-01T00:00:00Z',entryClosesAt:'2100-12-31T00:00:00Z',fulfillmentMethod:'digital',perFanTicketLimit:1};
const detail={raffle,enteredTickets:0,winner:null,canManage:false,member:true,consentVersion:'group-fulfillment-v1',canEnter:true};
const wallet={sequence:1,points:100,hearts:1,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}};
const originalShow=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal'),originalClose=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'close');
beforeAll(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(originalShow)Object.defineProperty(HTMLDialogElement.prototype,'showModal',originalShow);else Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');if(originalClose)Object.defineProperty(HTMLDialogElement.prototype,'close',originalClose);else Reflect.deleteProperty(HTMLDialogElement.prototype,'close');});
beforeEach(()=>{sessionStorage.clear();session.ownerId='owner-a';session.generation=0;vi.stubGlobal('confirm',vi.fn(()=>true));});
it('uses all supported locales for raffle controls',()=>{for(const locale of APP_LOCALES)expect(Object.values(raffleCopy(locale)).every(x=>typeof x==='string'&&x.length>0)).toBe(true);});
it('keeps single-ticket entry implicit and replays the same request after a lost response',async()=>{
 const writes:Record<string,unknown>[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(url==='/api/me/wallet')return Response.json(wallet);if(url.endsWith('/entries')){const body=JSON.parse(input!.body as string);writes.push(body);expect(JSON.parse(sessionStorage.getItem(`kyaa-raffle-pending:owner-a:${id}:${id}`)!)).toEqual(body);if(writes.length===1)throw new TypeError('offline');return Response.json({id,amount:1,enteredTickets:1,tickets:11});}return Response.json(detail);}));
 const view=render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:'응모하기'}));fireEvent.click(await screen.findByRole('button',{name:'1장으로 응모하기'}));await screen.findByRole('alert');expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();view.unmount();render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/결과/}));await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[0]).toEqual(writes[1]);await waitFor(()=>expect(sessionStorage.length).toBe(0));
});
it('does not show an entry action to a nonmember',async()=>{vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:{...detail,member:false,canEnter:false})));render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);expect(await screen.findByRole('link',{name:'가입하기'})).toHaveAttribute('href',`/pages/groups/${id}?locale=ko`);expect(screen.queryByRole('button',{name:'응모하기'})).not.toBeInTheDocument();});

it('hides recipient input until an active actual consent document exists',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:{...detail,consentVersion:null,consentDocuments:null,winner:{id,status:'information_required',submitBy:'2100-12-31T00:00:00Z'}})));
 render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);await screen.findByRole('heading',{name:'당첨됐어요'});expect(screen.queryByRole('textbox',{name:'이름'})).not.toBeInTheDocument();
});

it('shows the ticket balance and limit before confirming a single-ticket entry',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:detail)));
 vi.mocked(window.confirm).mockReturnValue(false);render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);
 await screen.findByText('보유 응모권');expect(screen.getByText('응모 후 응모권')).toBeInTheDocument();expect(screen.getByText('최대 응모 장수')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'응모하기'}));const dialog=screen.getByRole('dialog',{name:'응모권 1장을 사용할까요?'});expect(within(dialog).getByText('보유 응모권')).toBeInTheDocument();expect(within(dialog).getByText('응모 후 응모권')).toBeInTheDocument();expect(within(dialog).getByText('12')).toBeInTheDocument();expect(within(dialog).getByText('11')).toBeInTheDocument();expect(window.confirm).not.toHaveBeenCalled();fireEvent.click(within(dialog).getAllByRole('button',{name:'취소'}).at(-1)!);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('confirms recipient submission and retains its state on a fresh detail read',async()=>{
 let submitted=false;const document={title:'수령 정보 이용',body:'예시 동의',documentUrl:null,items:[{id:'required',label:'정보 제공 동의',required:true}]};
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(url==='/api/me/wallet')return Response.json(wallet);if(url.endsWith('/recipient')){expect(JSON.parse(String(input?.body))).toMatchObject({name:'예시 회원',phone:'01000000000',consented:true});submitted=true;return Response.json({id,status:'submitted'});}return Response.json({...detail,consentDocuments:{ko:document,en:document},winner:{id,status:submitted?'submitted':'information_required',submitBy:'2100-12-31T00:00:00Z'}});}));
 const view=render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);fireEvent.change(await screen.findByRole('textbox',{name:'이름'}),{target:{value:'예시 회원'}});fireEvent.change(screen.getByRole('textbox',{name:'연락처'}),{target:{value:'01000000000'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'수령 정보 제출'}));
 await screen.findByRole('heading',{name:'수령 정보를 제출했어요.'});expect(screen.queryByText('응모가 접수됐어요.')).not.toBeInTheDocument();view.unmount();render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);await screen.findByRole('heading',{name:'수령 정보를 제출했어요.'});expect(screen.queryByRole('textbox',{name:'이름'})).not.toBeInTheDocument();
});

it('keeps the source quantity controls within the actual balance and per-fan remainder',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:{...detail,raffle:{...raffle,perFanTicketLimit:5},enteredTickets:3})));
 render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko'/>);
 const input=await screen.findByRole('spinbutton');
 expect(input).toHaveValue(1);
 expect(screen.getByRole('button',{name:'응모 장수 −'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'응모 장수 +'}));
 expect(input).toHaveValue(2);
 expect(screen.getByRole('button',{name:'응모 장수 +'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'2장으로 응모하기'})).toBeEnabled();
 fireEvent.change(input,{target:{value:'3'}});
 expect(screen.getByRole('button',{name:'응모하기'})).toBeDisabled();
});

it('uses optional creator context while preserving the entry ticket limit',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url==='/api/me/wallet'?wallet:{...detail,raffle:{...raffle,perFanTicketLimit:100}})));
 render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko' localPresentation={{header:<header><h1>엔카이브 팬페이지</h1></header>,aside:<aside aria-label='팬 활동'>출석 확인</aside>}}/>);
 expect(screen.getByRole('heading',{name:'엔카이브 팬페이지'})).toBeInTheDocument();expect(screen.getByRole('complementary',{name:'팬 활동'})).toBeInTheDocument();
 const input=await screen.findByRole('spinbutton');fireEvent.change(input,{target:{value:'13'}});expect(screen.getByRole('button',{name:'응모하기'})).toBeDisabled();fireEvent.change(input,{target:{value:'10'}});expect(screen.getByRole('button',{name:'10장으로 응모하기'})).toBeEnabled();
});
it('confirms the immutable ten-ticket quantity and shows only the actual receipt total',async()=>{
 const writes:Record<string,unknown>[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(url==='/api/me/wallet')return Response.json(wallet);if(url.endsWith('/entries')){writes.push(JSON.parse(String(input?.body)));return Response.json({id,amount:10,enteredTickets:40,tickets:2});}return Response.json({...detail,raffle:{...raffle,perFanTicketLimit:100},enteredTickets:30});}));
 const view=render(<GroupRaffleScreen pageId={id} raffleId={id} locale='ko' localPresentation={{header:null,aside:null}}/>);fireEvent.click(await screen.findByRole('button',{name:'10장으로 응모하기'}));const dialog=screen.getByRole('dialog',{name:'응모권 10장을 사용할까요?'});expect(writes).toEqual([]);expect(dialog).toHaveTextContent('30 → 40');fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'1'}});fireEvent.click(within(dialog).getByRole('button',{name:'10장으로 응모하기'}));await screen.findByRole('heading',{name:'응모를 완료했어요'});expect(writes).toHaveLength(1);expect(writes[0].amount).toBe(10);expect(view.container.querySelector('[data-source-state="uNHy1"]')).toHaveTextContent('총 40장');
});
