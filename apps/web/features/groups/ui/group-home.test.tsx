import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const rules={checkin:{points:2,streakBonus:10,streakEvery:7},post:{points:20,dailyLimit:3},comment:{points:3,dailyLimit:10},proof:{points:100,dailyLimit:null}};
const pageId='e9200000-0000-4000-8000-000000000003';
const h=vi.hoisted(()=>({auth:false,ready:true,member:false as boolean,compact:false,activeTab:'members',today:undefined as unknown,urls:[] as string[],events:[] as unknown[]}));
const page={id:pageId,kind:'brand',slug:'run-and-music',name:'RUN&MUSIC',celebrityId:null,imageUrl:null,description:'',memberCount:13,question:null};
vi.mock('./group-page-context',()=>({useGroupPage:()=>({page,activeTab:h.activeTab,detail:{page,membership:h.member?{role:'member'}:null},ownerKey:'u',startJoin:vi.fn(),joinPending:false,hrefFor:(tab:string,extra?:Record<string,string>)=>`/pages/groups/${pageId}?${new URLSearchParams({locale:'ko',tab,...extra})}`,star:h.member?{state:'filled',label:'가입함'}:h.auth?{state:'empty',label:'가입',onClick:vi.fn()}:{state:'empty',label:'가입',href:'/login?locale=ko'}}),useOptionalGroupPage:()=>null}));
vi.mock('./group-page-menu',()=>({useCompactHeader:()=>h.compact}));
vi.mock('./group-board',()=>({GroupBoard:()=><section data-testid='board'/>,parseGroupPosts:(v:unknown)=>v}));
vi.mock('./group-home-panels',()=>({GroupBrandHomeEvent:()=>null,GroupHomeGallery:()=>null}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:()=><div role='dialog'/>}));
vi.mock('@/features/dukjil/ui/creator-attendance-entry',()=>({CreatorAttendanceEntry:()=>null}));
vi.mock('./use-group-resource',()=>({
 GroupRequestError:class extends Error{},
 useGroupRequest:()=>({request:async(url:string)=>{if(url.startsWith('/api/dukjil/catalog'))return {version:1,rules,missionBook:{}};if(url.includes('/events'))return {events:h.events,canManage:false,nextCursor:null};throw new Error(url);},authenticated:h.auth,ready:h.ready,ownerKey:'u'}),
 useGroupResource:(url:string|null)=>{if(url)h.urls.push(url);return {data:url?h.today:undefined,failure:undefined,loading:false,retry:vi.fn()};},
}));

import {resetDukjilCatalogCache} from '@/features/dukjil/ui/dukjil-provider';
import {GroupHome,GroupSideRail} from './group-home';

const activeToday={kstDate:'2026-11-07',policyActive:true,totalPoints:22,hasPassport:null,attendance:null,actions:{post:{count:1,points:20,remaining:2,stamped:true}}};
beforeEach(()=>{resetDukjilCatalogCache();h.auth=false;h.ready=true;h.member=false;h.compact=false;h.activeTab='members';h.today=activeToday;h.urls=[];h.events=[];});
afterEach(cleanup);
const home=()=>render(<GroupHome locale='ko' pageId={pageId}/>);
const missions=(root:HTMLElement)=>[...root.querySelectorAll('[data-mission]')].map(row=>row.getAttribute('data-mission'));

it('gives a guest the same home as a fan page: schedule, locked mission card, join card, and no activity card',async()=>{
 const view=home();
 await screen.findByRole('heading',{name:'다가오는 일정',level:2});
 await waitFor(()=>expect(missions(view.container)).toEqual(['checkin','post','comment','proof']));
 expect(screen.queryByText('모임 활동 인증')).not.toBeInTheDocument();
 expect(screen.queryByText('내 활동')).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'가입한 팬이 할 수 있는 일'})).toBeInTheDocument();
 expect(screen.getByRole('img',{name:'로그인 후 확인'})).toBeInTheDocument();
 expect(h.urls.filter(url=>url.startsWith('/api/me/'))).toEqual([]);
});

it('sends a guest to login from every mission row and from the join card',async()=>{
 const view=home();
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 const rows=[...view.container.querySelectorAll('[data-mission] a')];
 for(const row of rows)expect(row.getAttribute('href')).toMatch(/^\/login\?/);
 expect(within(screen.getByRole('heading',{name:'가입한 팬이 할 수 있는 일'}).closest('section')!).getByRole('link',{name:'가입'})).toHaveAttribute('href','/login?locale=ko');
});

it('promises only what the server pays on a group: check-in points, no post or comment points, no progress',async()=>{
 h.auth=true;
 const view=home();
 const checkin=await waitFor(()=>{const row=view.container.querySelector('[data-mission=checkin]');if(!row?.textContent?.includes('+2P'))throw new Error('catalog pending');return row;});
 expect(checkin).toHaveTextContent('+2P');
 for(const key of ['post','comment','proof'])expect(view.container.querySelector(`[data-mission=${key}]`)).not.toHaveTextContent(/\+\d+P/);
 expect(view.container.querySelector('[role=progressbar]')).toBeNull();
 expect(view.container.querySelector('[data-mission=post]')).not.toHaveTextContent('1/3');
});

it('reads today without a creator for a signed-in fan and shows it in the head',async()=>{
 h.auth=true;
 home();
 await screen.findByText('오늘 +22P');
 expect(h.urls).toContain('/api/me/dukjil/today');
});

it('links a joined fan straight to writing and to the existing group missions, and drops the join card',async()=>{
 h.auth=true;h.member=true;
 const view=home();
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 expect(view.container.querySelector('[data-mission=post] a')).toHaveAttribute('href',`/pages/groups/${pageId}?locale=ko&tab=board&compose=1`);
 expect(view.container.querySelector('[data-mission=comment] a')).toHaveAttribute('href',`/pages/groups/${pageId}?locale=ko&tab=board`);
 expect(view.container.querySelector('[data-mission=proof] a')).toHaveAttribute('href',`/pages/groups/${pageId}/missions?locale=ko`);
 expect(screen.queryByRole('heading',{name:'가입한 팬이 할 수 있는 일'})).not.toBeInTheDocument();
});

it('asks a signed-in visitor who has not joined to join first and opens the board without the composer',async()=>{
 h.auth=true;
 const view=home();
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 expect(view.container.querySelector('[data-mission=post] a')).toHaveAttribute('href',`/pages/groups/${pageId}?locale=ko&tab=board`);
 expect(screen.getByRole('button',{name:'가입'})).toBeInTheDocument();
});

it('opens the attendance dialog from the check-in row',async()=>{
 h.auth=true;h.member=true;
 const view=home();
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 fireEvent.click(view.container.querySelector('[data-mission=checkin] a')!);
 expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('shows the group events of the month in the mini calendar with their detail links',async()=>{
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
 h.events=[{id:'e9200000-0000-4000-8000-000000000009',title:'한강 달리기',description:'',imageUrl:null,startsAt:`${month}-28T11:00:00.000Z`,endsAt:`${month}-28T12:00:00.000Z`,opensAt:`${month}-01T00:00:00.000Z`,closesAt:`${month}-28T10:00:00.000Z`,location:'',capacity:null,requiresApproval:false,state:'published',revision:1,official:true,entryStatus:'none',ticketAvailable:false,approvalStatus:'approved'}];
 home();
 const event=await screen.findByRole('link',{name:/한강 달리기/});
 expect(event.getAttribute('href')).toContain(`/pages/groups/${pageId}/events/e9200000-0000-4000-8000-000000000009`);
});

it('places the same parts in the column on a narrow screen, once',async()=>{
 h.compact=true;
 const view=home();
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 expect(view.container.querySelectorAll('[data-fan-missions]')).toHaveLength(1);
 expect(screen.getAllByRole('heading',{name:'다가오는 일정',level:2})).toHaveLength(1);
});

it('keeps the mission card in the side rail of the other tabs',async()=>{
 const view=render(<GroupSideRail locale='ko' pageId={pageId}/>);
 await waitFor(()=>expect(missions(view.container)).toHaveLength(4));
 expect(screen.queryByText('모임 활동 인증')).not.toBeInTheDocument();
});

for(const tab of ['board','news'])it(`keeps ${tab} focused on posts without activity or event rail`,()=>{h.activeTab=tab;const view=render(<GroupSideRail locale='ko' pageId={pageId}/>);expect(view.container).toBeEmptyDOMElement();});
