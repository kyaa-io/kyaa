import {configure,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {PencilBenefitsPreview} from './pencil-benefits-preview';
configure({defaultHidden:true});
const authFixture=vi.hoisted(()=>({ready:false,authenticated:false,generation:0,user:{id:'synthetic'},getAccessToken:vi.fn(async()=> 'test-token')}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>authFixture}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:authFixture.ready,ownerId:authFixture.user.id,generation:authFixture.generation})}));
vi.mock('@/components/fan-shell/fan-app-shell',()=>({FanAppHeader:()=>null,FanAppBottomNavigation:()=>null}));
const proto=HTMLDialogElement.prototype,originalShow=Object.getOwnPropertyDescriptor(proto,'showModal'),originalClose=Object.getOwnPropertyDescriptor(proto,'close');
beforeAll(()=>{Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterAll(()=>{if(originalShow)Object.defineProperty(proto,'showModal',originalShow);else Reflect.deleteProperty(proto,'showModal');if(originalClose)Object.defineProperty(proto,'close',originalClose);else Reflect.deleteProperty(proto,'close');});
afterEach(()=>{
 Object.assign(authFixture,{ready:false,authenticated:false,generation:0,user:{id:'synthetic'}});
 vi.unstubAllGlobals();
});

function mockRequests(wallet:()=>Response|Promise<Response>=()=>Response.json(walletFixture)){
 const request=vi.fn(async(url:string,_init?:RequestInit)=>{
  if(url==='/api/me/wallet')return wallet();
  if(url==='/api/groups/benefits?kind=raffles')return Response.json({kind:'raffles',items:[],nextCursor:null});
  throw new Error(`Unexpected request: ${url}`);
 });
 vi.stubGlobal('fetch',request);
 return request;
}

it('shows validated wallet balances, without exposing hearts or point events',async()=>{
 authFixture.ready=true;authFixture.authenticated=true;const request=mockRequests(()=>Response.json({...walletFixture,hearts:2}));const view=render(<PencilBenefitsPreview locale='ko'/>);await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^2,450마일리지$/));expect(view.container.querySelector('[data-summary=points] dd img')).toHaveAttribute('src','/images/economy/mileage-coin.webp');expect(view.container.querySelectorAll('dd')[1]).toHaveTextContent(/^12장$/);expect(screen.getAllByText('응모권').length).toBeGreaterThan(0);expect(screen.queryByText('2개')).not.toBeInTheDocument();expect(screen.queryByText('35개')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:/캡슐 럭키드로우/})).toHaveAttribute('href','/my/capsules?locale=ko');expect(screen.queryByRole('region',{name:'포인트 이벤트'})).not.toBeInTheDocument();expect(request.mock.calls.some(([url])=>url==='/api/me/wallet')).toBe(true);
});
it.each(['v32uWj','fekJf','OMn1B','XKjmZ'] as const)('renders %s as an unavailable conversion with no invented rate',nodeId=>{
 const retry=vi.fn(),close=vi.fn(),request=vi.fn();vi.stubGlobal('fetch',request);render(<PencilBenefitsPreview locale='ko' nodeId={nodeId} onRetry={retry} onClose={close}/>);const dialog=screen.getByRole('dialog');expect(dialog).toHaveAttribute('data-source-node',nodeId);expect(screen.getByText('확인 필요')).toBeInTheDocument();expect(screen.getAllByText('— P').length).toBeGreaterThanOrEqual(2);expect(screen.getByText('포인트는 차감되지 않았어요. 다시 확인해 주세요.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'전환 수량 늘리기'}));expect(screen.getByRole('spinbutton',{name:'전환 수량'})).toHaveValue(11);fireEvent.change(screen.getByRole('spinbutton',{name:'전환 수량'}),{target:{value:'1'}});expect(screen.getByRole('button',{name:'전환 수량 줄이기'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'다시 확인하기'}));expect(retry).toHaveBeenCalledOnce();fireEvent(dialog,new Event('cancel',{bubbles:true,cancelable:true}));expect(close).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
});
const walletFixture={sequence:1,points:2450,hearts:35,tickets:12,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-03',checkedIn:false,streak:0,nextBonusIn:7}};
it('clears the visible wallet immediately on owner transition and logout',async()=>{authFixture.ready=true;authFixture.authenticated=true;authFixture.user.id='owner-a';const pending:Array<(response:Response)=>void>=[];mockRequests(()=>authFixture.user.id==='owner-a'?Promise.resolve(Response.json(walletFixture)):new Promise<Response>(resolve=>{pending.push(resolve);}));const view=render(<PencilBenefitsPreview locale='ko'/>);await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^2,450마일리지$/));authFixture.user.id='owner-b';view.rerender(<PencilBenefitsPreview locale='ko'/>);expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^—$/);await waitFor(()=>expect(pending.length).toBeGreaterThan(0));for(const resolve of pending)resolve(Response.json({...walletFixture,points:350}));await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^350마일리지$/));authFixture.authenticated=false;view.rerender(<PencilBenefitsPreview locale='ko'/>);expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^—$/);view.unmount();});
it('hides the previous wallet when the same owner session generation changes',async()=>{authFixture.ready=true;authFixture.authenticated=true;authFixture.generation=0;const pending:Array<(response:Response)=>void>=[];mockRequests(()=>authFixture.generation===0?Promise.resolve(Response.json(walletFixture)):new Promise<Response>(resolve=>pending.push(resolve)));const view=render(<PencilBenefitsPreview locale='ko'/>);await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^2,450마일리지$/));authFixture.generation=1;view.rerender(<PencilBenefitsPreview locale='ko'/>);expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^—$/);await waitFor(()=>expect(pending.length).toBeGreaterThan(0));for(const resolve of pending)resolve(Response.json({...walletFixture,points:350}));await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^350마일리지$/));view.unmount();});
it('keeps the raffle catalog closed and leaves conversion out of the Pencil overview',async()=>{
 authFixture.ready=true;
 authFixture.authenticated=true;
 const request=mockRequests();
 const view=render(<PencilBenefitsPreview locale='ko'/>);

 await waitFor(()=>expect(view.container.querySelector('[data-summary=points] dd')).toHaveTextContent(/^2,450마일리지$/));
 expect(await screen.findByText('아직 공개된 항목이 없어요')).toBeInTheDocument();
 const catalog=screen.getByRole('region',{name:'럭키드로우'});
 expect(catalog.closest('[inert]')).toHaveAttribute('aria-hidden','true');
 expect(within(catalog).getByRole('link',{name:/캡슐 럭키드로우/})).toHaveAttribute('href','/my/capsules?locale=ko');
 expect(screen.getAllByText('곧 안내해 드릴게요')).toHaveLength(1);
 expect(screen.queryByText('100 P')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'광고보기 교환'})).not.toBeInTheDocument();
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(screen.queryByRole('radio')).not.toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'하트 보내기'})).not.toBeInTheDocument();
 expect(screen.queryByRole('spinbutton',{name:'보낼 하트'})).not.toBeInTheDocument();
 expect(request.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true);
});
