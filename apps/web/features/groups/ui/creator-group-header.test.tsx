import {render,screen} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {CreatorGroupHeader,CreatorGroupActivities,CreatorGroupRooms} from './creator-group-header';
import {GroupPageProvider} from './group-page-context';
const state=vi.hoisted(()=>({data:undefined as any,query:'',error:false,failure:undefined as any,loading:false,authenticated:false,ready:true,summary:{state:{status:'loading'},retry:()=>{}} as any,urls:[] as (string|null)[]}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock('./use-group-resource',()=>({GroupRequestError:class extends Error{},useGroupRequest:()=>({request:vi.fn(),authenticated:state.authenticated,ready:state.ready,ownerKey:'local'}),useGroupResource:(url:string|null)=>{state.urls.push(url);return {data:url?state.data:undefined,error:state.error,failure:state.failure,loading:state.loading,ownerKey:'local',authenticated:state.authenticated,ready:state.ready,request:vi.fn(),retry:vi.fn()};}}));
vi.mock('./use-group-preload',()=>({usePreloadGroupResource:()=>vi.fn()}));
vi.mock('./use-group-presence',async importOriginal=>({...await importOriginal<typeof import('./use-group-presence')>(),useOwnGroupPresence:()=>({error:false,retry:vi.fn()})}));
vi.mock('./group-presence',()=>({GroupPresence:({memberCount}:any)=><div data-testid='presence'>{memberCount}</div>}));
vi.mock('./group-page-menu',()=>({GroupPageMenu:()=><button>page-menu</button>,useCompactHeader:()=>false}));
vi.mock('./group-activities',()=>({GroupActivitiesPanel:({pageId}:any)=><div>activities:{pageId}</div>,GroupEventsList:()=>null,GroupCollections:()=>null}));
vi.mock('./group-rooms-panel',()=>({GroupRoomsPanel:({pageId,slug}:any)=><div>rooms:{pageId}:{slug}</div>}));
vi.mock('./group-members',()=>({GroupMembers:()=>null}));
vi.mock('./creator-group-home',()=>({CreatorBrandNewsPreview:()=>null}));
vi.mock('./group-home-panels',()=>({GroupBrandHomeEvent:()=>null}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:state.ready,authenticated:state.authenticated,user:null,getAccessToken:async()=>null})}));
vi.mock('@/components/fan-ui/use-owned-fan-resource',()=>({useOwnedFanResource:(url:string|null)=>{state.urls.push(url);return state.summary;}}));
vi.mock('@/features/content-safety/ui/use-automatic-translation',()=>({TranslatedText:({text}:any)=>text}));
const celebrity={slug:'elina',name:'엘리나',summary:'원문',roles:['creator'],image:{url:'/fixture.png'},socialLinks:[{platform:'youtube',url:'https://youtube.test/x'}]} as any;
const brand={...celebrity,slug:'runmusic',name:'RUN&MUSIC',roles:['brand']};
const page=(patch:object={})=>({id:'page-id',kind:'fan',slug:'elina',celebrityId:'c',name:'엘리나',description:'설명',memberCount:13,question:null,imageUrl:null,...patch});
beforeEach(()=>{Object.assign(state,{data:undefined,query:'',error:false,failure:undefined,loading:false,authenticated:false,ready:true,summary:{state:{status:'loading'},retry:()=>{}},urls:[]});});

it('renders one header without the old meta line, join button or text verification link',()=>{
 state.data={page:page(),membership:null};render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 expect(screen.getByRole('heading',{level:1,name:'엘리나'})).toBeInTheDocument();
 expect(document.querySelector('[data-fan-page-header="fan"]')).toBeInTheDocument();
 expect(screen.getByText('팬페이지')).toHaveAttribute('data-fan-tag','fan');
 expect(screen.queryByText(/팬페이지 · /)).toBeNull();expect(screen.queryByRole('link',{name:'가입하기'})).toBeNull();
 expect(screen.getByTestId('presence')).toHaveTextContent('13');
});
it('Q1 fan page: signed out goes to login with verify as returnTo and keeps the same label',()=>{
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 const star=screen.getByRole('link',{name:'팬 인증'});expect(star).toHaveAttribute('data-fan-star','empty');
 const target=new URL(star.getAttribute('href')!,'https://kyaa.test');expect(target.pathname).toBe('/login');expect(target.searchParams.get('returnTo')).toContain('/c/elina/verify?locale=ko');
});
it('Q1 fan page: restoring auth links straight to verification, member without a passport too',()=>{
 state.ready=false;const first=render(<CreatorGroupHeader celebrity={celebrity} locale='en' tab='board'/>);
 expect(screen.getByRole('link',{name:'Verify'})).toHaveAttribute('href','/c/elina/verify?locale=en');first.unmount();
 state.ready=true;state.authenticated=true;state.data={page:page(),membership:null,bookmarked:true};render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='board'/>);
 const star=screen.getByRole('link',{name:'팬 인증'});expect(star).toHaveAttribute('href','/c/elina/verify?locale=ko');expect(star).not.toHaveAttribute('aria-pressed');
});
it('Q1 fan page: a passport fills the star and opens that passport',()=>{
 state.authenticated=true;state.data={page:page(),membership:null};state.summary={state:{status:'ready',data:{creators:[{celebrity:{slug:'elina'},passport:{id:'pass-1',tier:'Silver'}}]}},retry:()=>{}};
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 const star=screen.getByRole('link',{name:'팬 인증 완료'});expect(star).toHaveAttribute('href','/passports/pass-1?locale=ko');expect(star).toHaveAttribute('data-fan-star','filled');
});
it('Q1 brand: signed-in join button, joined shows a status that does not leave, signed out logs in',()=>{
 state.authenticated=true;state.data={page:page({kind:'brand',slug:'runmusic',name:'RUN&MUSIC'}),membership:null};
 const first=render(<CreatorGroupHeader celebrity={brand} locale='ko' tab='home'/>);
 expect(screen.getByRole('button',{name:'가입'})).toHaveAttribute('data-fan-star','empty');first.unmount();
 state.data={page:page({kind:'brand',slug:'runmusic',name:'RUN&MUSIC'}),membership:{role:'member',joinedAt:'2026-11-01'}};
 const second=render(<CreatorGroupHeader celebrity={brand} locale='ko' tab='home'/>);
 expect(screen.getByText('가입함').closest('[data-fan-star]')).toHaveAttribute('data-fan-star','filled');expect(screen.queryByRole('button',{name:'가입함'})).toBeNull();second.unmount();
 state.authenticated=false;state.data={page:page({kind:'brand',slug:'runmusic',name:'RUN&MUSIC'}),membership:null};
 render(<CreatorGroupHeader celebrity={brand} locale='ko' tab='home'/>);
 expect(new URL(screen.getByRole('link',{name:'가입'}).getAttribute('href')!,'https://kyaa.test').pathname).toBe('/login');
});
it('signed out never asks for my summary',()=>{render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);expect(state.urls.filter(url=>url?.startsWith('/api/me/'))).toEqual([]);});
it('places the single members link immediately after calendar in navigation',()=>{
 state.data={page:page(),membership:null};const {container}=render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 expect(Array.from(container.querySelectorAll('nav[data-fan-tabs] a')).map(link=>link.textContent)).toEqual(['홈','게시판','비밀방','캘린더','팬·랭킹']);
 expect(screen.getByRole('link',{name:'홈'})).toHaveAttribute('aria-current','page');
});
it('renders the page menu exactly once for a member and not at all otherwise',()=>{state.data={page:page(),membership:{role:'member',joinedAt:'2026-11-01'}};const view=render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);expect(screen.getAllByRole('button',{name:'page-menu'})).toHaveLength(1);view.unmount();state.data={page:page(),membership:null};render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);expect(screen.queryByRole('button',{name:'page-menu'})).toBeNull();});
it('keeps navigation context in the address family it came from',()=>{
 state.data={page:page(),membership:null};state.query='returnTo=%2Fmy&room=original-room&month=2026-12&source=fans';
 const first=render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='rooms'/>);
 expect(screen.getByRole('link',{name:'비밀방'})).toHaveAttribute('href','/elina?locale=ko&tab=rooms&returnTo=%2Fmy&room=original-room');
 expect(screen.getByRole('link',{name:'캘린더'})).toHaveAttribute('href','/elina?locale=ko&tab=calendar&returnTo=%2Fmy&month=2026-12');
 expect(screen.getByRole('link',{name:'게시판'})).toHaveAttribute('href','/elina?locale=ko&tab=board&returnTo=%2Fmy&source=fans');
 expect(screen.getByRole('link',{name:'팬·랭킹'})).toHaveAttribute('href','/elina?locale=ko&tab=members&returnTo=%2Fmy');first.unmount();
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='rooms' pageId='page-id'/>);
 expect(screen.getByRole('link',{name:'팬·랭킹'})).toHaveAttribute('href','/pages/groups/page-id?locale=ko&tab=members&returnTo=%2Fmy');
});
it('tab bodies read the one provider and do not resolve the page again',()=>{
 state.data={page:page(),membership:null};
 render(<GroupPageProvider slug='elina' celebrity={celebrity} locale='ko'><CreatorGroupActivities locale='ko'/><CreatorGroupRooms slug='elina' locale='ko'/></GroupPageProvider>);
 expect(screen.getByText('activities:page-id')).toBeInTheDocument();expect(screen.getByText('rooms:page-id:elina')).toBeInTheDocument();
 expect(state.urls.filter(url=>url==='/api/groups/resolve/elina').length).toBe(1);
});
it('shows a skeleton while resolving and keeps the resolver error with a retry',()=>{
 const first=render(<GroupPageProvider slug='elina' celebrity={celebrity} locale='ko'><CreatorGroupActivities locale='ko'/></GroupPageProvider>);
 expect(document.querySelector('[data-fan-skeleton]')).toHaveAttribute('aria-busy','true');expect(screen.queryByText('불러오는 중')).toBeNull();first.unmount();
 state.error=true;render(<GroupPageProvider slug='elina' celebrity={celebrity} locale='ko'><CreatorGroupActivities locale='ko'/></GroupPageProvider>);
 expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.getByRole('button',{name:'다시 시도'})).toBeInTheDocument();
});
