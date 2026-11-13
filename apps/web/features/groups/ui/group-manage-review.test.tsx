vi.mock("../secret-room-config", () => ({ SECRET_ROOMS_ENABLED: true }));
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import type {GroupDetail} from '../domain/contracts';
import {messages} from '@/i18n/catalogs/features__groups__ui__manage-form-source';
import {GroupManagement} from './group-management';
import {GroupOperatorStats} from './group-operator-stats';
import {GroupManageScreen} from './group-manage-screen';
import {manageFormSource} from './manage-form-source';
import {manageFormText} from './manage-form-copy';
import {managementCopy} from './management-copy';
import {managementMembersCopy} from './management-members-copy';
import {operatorToolsCopy} from './operator-tools-copy';
const nav=vi.hoisted(()=>({search:new URLSearchParams()}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken:async()=>'token'}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner',generation:0}));
vi.mock('next/navigation',async original=>({...await original<typeof import('next/navigation')>(),useRouter:()=>({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}),usePathname:()=>'/',useSearchParams:()=>nav.search}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
const id='10000000-0000-4000-8000-000000000001';
const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'',imageUrl:null,question:null,anonymous:false,memberCount:2},membership:{role:'owner',joinedAt:'2026-11-01T00:00:00Z'},bookmarked:false} as unknown as GroupDetail;
const stats=(visitors:number)=>({days:7,from:'2026-11-01',to:'2026-11-07',members:1,joinedInPeriod:1,posts:0,postsInPeriod:0,notices:0,visitors,visitDays:visitors,daily:Array.from({length:7},(_,i)=>({day:`2026-11-0${i+1}`,visitors:i===6?visitors:0}))});
let responses:Record<string,unknown>={};
beforeEach(()=>{responses={};nav.search=new URLSearchParams();window.history.replaceState(null,'','/manage');vi.stubGlobal('fetch',vi.fn(async(url:string)=>{for(const[k,v]of Object.entries(responses))if(url.includes(k))return Response.json(v);if(url.includes('/mission-stats'))return Response.json({from:'2026-11-03',to:'2026-11-09',attendance:null,items:[]});if(url.includes('/missions'))return Response.json({missions:[],canManage:true,nextCursor:null});if(url.includes('/raffles'))return Response.json({raffles:[]});return Response.json({items:[],nextCursor:null});}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const manage=(section:string)=>render(<GroupManagement detail={detail} locale='ko' refresh={vi.fn()} section={section}/>);

it('calls people fans in the manage copy, role name included',()=>{
 expect(Object.values(managementMembersCopy('ko')).join(' ')).not.toContain('회원');
 expect(managementMembersCopy('ko')).toMatchObject({title:'팬 관리',search:'팬 검색',detail:'팬 상세',bulk:'선택한 팬 역할 변경',noMatch:'일치하는 팬이 없어요.'});
 expect(managementCopy('ko').member).toBe('팬');expect(managementCopy('ko').confirmTransfer).not.toContain('회원');
 expect(managementMembersCopy('en').title).toBe('Fan management');expect(managementCopy('en').member).toBe('Fan');
});
it('G3: names the members tab 회원 while the role names keep calling people fans',()=>{
 expect(operatorToolsCopy('ko').tab).toBe('회원');
 expect(managementCopy('ko').member).toBe('팬');
});
it('keeps one number slot in every locale of the count and period copy',()=>{
 for(const locale of APP_LOCALES){const o=operatorToolsCopy(locale);expect(o.count.match(/\{n\}/g),locale).toHaveLength(1);expect(o.days.match(/\{n\}/g),locale).toHaveLength(1);}
});
it('U7: orders the manage tabs members, missions, notices, then the existing tabs, with members by default',async()=>{
 responses={[`/api/groups/${id}`]:detail};
 render(<GroupManageScreen pageId={id} locale='ko'/>);
 const tabs=await screen.findByRole('navigation',{name:'페이지 운영'});
 const order=Array.from(tabs.querySelectorAll('a')).map(a=>new URL(a.getAttribute('href')!,'https://kyaa.test').searchParams.get('section'));
 expect(order).toEqual(['members','missions','notices','reports','events','gifts','raffles','rooms',...(order.includes('collection')?['collection']:[]),'stats','settings']);
 expect(tabs.querySelector('[aria-current=page]')).toHaveTextContent('회원');
});
it('shows the mission status table above the mission list with the daily cheer row on a fan page',async()=>{
 responses={'/mission-stats':{from:'2026-11-03',to:'2026-11-09',attendance:{participants:4},items:[{missionId:'10000000-0000-4000-8000-000000000007',title:'응원 사진 올리기',state:'published',submissionKind:'photo',participants:3,pending:1,approved:2,rejected:1}]}};
 manage('missions');
 expect(await screen.findByRole('heading',{name:operatorToolsCopy('ko').statsTitle})).toBeInTheDocument();
 expect(screen.getByText(operatorToolsCopy('ko').dailyCheer)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:operatorToolsCopy('ko').review})).toHaveAttribute('href',expect.stringContaining('/missions/10000000-0000-4000-8000-000000000007'));
 expect(screen.getByText(manageFormText('ko','kindPhoto'))).toBeInTheDocument();
});
it('fills every locale of the new form copy with the same placeholders',()=>{
 const holes=(text:string)=>(text.match(/\{\d+\}/g)??[]).sort();
 expect(Object.keys(messages).sort()).toEqual(Object.keys(manageFormSource).sort());
 for(const[key,source]of Object.entries(manageFormSource))for(const locale of APP_LOCALES.filter(item=>item!=='ko'&&item!=='en')){
  const text=(messages as Record<string,Record<string,string>>)[key][locale];
  expect(text?.trim(),`${key}/${locale}`).toBeTruthy();expect(holes(text),`${key}/${locale}`).toEqual(holes(source.en));
 }
});
it('shows missions as a list with one create button, then the form in the same place',async()=>{
 const view=manage('missions');
 const create=await screen.findByRole('button',{name:'덕질 만들기'});
 expect(view.container.querySelector('form')).toBeNull();expect(view.container.querySelector('details')).toBeNull();
 expect(await screen.findByText(manageFormText('ko','missionsNone'))).toBeInTheDocument();
 fireEvent.click(create);
 const form=view.container.querySelector('form')!;
 expect(form.querySelector('[name=title]')).toHaveAttribute('placeholder',manageFormText('ko','missionName'));
 expect(form.querySelectorAll('button[type=submit]')).toHaveLength(1);
 expect(window.location.search).toContain('new=1');
});
it('shows raffles as a list first and names the form fields for a raffle',async()=>{
 const view=manage('raffles');
 const create=await screen.findByRole('button',{name:'추첨 만들기'});
 expect(view.container.querySelector('details')).toBeNull();expect(view.container.querySelector('form')).toBeNull();
 expect(await screen.findByText(manageFormText('ko','raffleNone'))).toBeInTheDocument();
 fireEvent.click(create);
 expect(screen.getByLabelText(manageFormText('ko','raffleDescription'))).toHaveAttribute('name','summary');
 expect(screen.queryByText('페이지 소개')).toBeNull();
 const method=view.container.querySelector('select[name=fulfillmentMethod]') as HTMLSelectElement;
 expect(method.options[0].textContent).not.toBe('—');
});
it('opens the raffle form at once when an approved gift is linked',async()=>{
 const view=render(<GroupManagement detail={detail} locale='ko' refresh={vi.fn()} section='raffles' initialGiftId='10000000-0000-4000-8000-000000000009'/>);
 expect(view.container.querySelector('select[name=fulfillmentMethod]')).toBeInTheDocument();
});
it('says no room exists instead of leaving an empty card',async()=>{
 responses={'/rooms':{items:[]}};manage('rooms');
 expect(await screen.findByText(manageFormText('ko','roomsNone'))).toBeInTheDocument();
});
it('writes the report detail labels in English',async()=>{
 responses={'/reports':{items:[{id,targetType:'post',targetId:id,reason:'광고',status:'received',createdAt:'2026-11-01T00:00:00Z',targetPostId:id,targetRoomId:null}],nextCursor:null}};
 render(<GroupManagement detail={detail} locale='en' refresh={vi.fn()} section='reports'/>);
 expect(await screen.findByRole('heading',{name:manageFormText('en','reportDetail')})).toBeInTheDocument();
 expect(screen.getByText(manageFormText('en','reportTarget'))).toBeInTheDocument();
 expect(screen.getByText(manageFormText('en','reportStatus'))).toBeInTheDocument();
});
it('says no one visited at zero and keeps the date axis',async()=>{
 responses={'/stats':stats(0)};render(<GroupOperatorStats pageId={id} locale='ko'/>);
 expect(await screen.findByText(manageFormText('ko','statsNoVisits'))).toBeInTheDocument();
 expect(screen.getByText('2026-11-01')).toBeInTheDocument();expect(screen.getByText('2026-11-07')).toBeInTheDocument();
});
it('draws the bars and no empty line once someone visited',async()=>{
 responses={'/stats':stats(1)};const view=render(<GroupOperatorStats pageId={id} locale='ko'/>);
 await waitFor(()=>expect(view.container.querySelectorAll('li i').length).toBe(7));
 expect(screen.queryByText(manageFormText('ko','statsNoVisits'))).toBeNull();
});
it('scrolls the tab strip to the current tab and marks what is hidden on the right',async()=>{
 const tabRect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.getAttribute('aria-current')==='page'?{left:600,right:680,width:80} as DOMRect:{left:0,right:390,width:390} as DOMRect;});
 const sw=vi.spyOn(HTMLElement.prototype,'scrollWidth','get').mockReturnValue(1000),cw=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
 responses={[`/api/groups/${id}`]:detail};nav.search=new URLSearchParams('section=settings');
 render(<GroupManageScreen pageId={id} locale='ko' initialSection='settings'/>);
 const tabs=await screen.findByRole('navigation',{name:'페이지 운영'});
 await waitFor(()=>expect(tabs.scrollLeft).toBeGreaterThan(0));
 expect(tabs).toHaveAttribute('data-more-end');
 tabRect.mockRestore();sw.mockRestore();cw.mockRestore();
});
