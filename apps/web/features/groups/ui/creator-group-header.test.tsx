import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupIdentityHeader} from './group-shell';
import {CreatorGroupHeader,CreatorGroupActivities,CreatorGroupRooms} from './creator-group-header';
const state=vi.hoisted(()=>({data:undefined as any,query:'',error:false,compact:false}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock('./use-group-resource',()=>({useGroupResource:()=>({data:state.data,error:state.error,ownerKey:'local',retry:vi.fn()})}));
vi.mock('./group-presence',()=>({GroupPresence:()=>null}));
vi.mock('./group-page-menu',()=>({GroupPageMenu:()=><button>page-menu</button>,useCompactHeader:()=>state.compact}));
vi.mock('./group-bookmark-action',()=>({GroupBookmarkAction:()=> <button>bookmark</button>}));
vi.mock('./creator-group-home',()=>({CreatorBrandNewsPreview:()=>null}));
vi.mock('@/features/content-safety/ui/use-automatic-translation',()=>({TranslatedText:({text}:any)=>text}));
const celebrity={slug:'elina',name:'엘리나',summary:'원문',roles:['creator'],image:{url:'/fixture.png'},socialLinks:[]} as any;
it('links the fan-page star to that artist verification even before group/auth data loads',()=>{
 state.data=undefined;render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 expect(screen.getByRole('link',{name:'팬 인증'})).toHaveAttribute('href','/c/elina/verify?locale=ko');expect(screen.queryByRole('button',{name:'bookmark'})).toBeNull();
});
it('does not interpret a bookmark as certification and retains locale',()=>{
 state.data={page:{id:'local',memberCount:1},membership:null,bookmarked:true};render(<CreatorGroupHeader celebrity={{...celebrity,slug:'nchive'}} locale='en' tab='board'/>);
 const star=screen.getByRole('link',{name:'Fan verification'});expect(star).toHaveAttribute('href','/c/nchive/verify?locale=en');expect(star).not.toHaveAttribute('aria-pressed');
});
it('preserves non-fan brand bookmark behavior',()=>{render(<CreatorGroupHeader celebrity={{...celebrity,roles:['brand']}} locale='ko' tab='home'/>);expect(screen.getByRole('button',{name:'bookmark'})).toBeInTheDocument();expect(screen.queryByRole('link',{name:'팬 인증'})).toBeNull();});

it('places the single members link immediately after calendar in navigation',()=>{state.data={page:{id:'local',memberCount:1},membership:null};const{container}=render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='members'/>);const links=container.querySelectorAll('nav#celebrity-content a');expect(links[3]).toHaveTextContent('캘린더');expect(links[4]).toHaveTextContent('팬·랭킹');expect(links[4]).toHaveAttribute('href','/elina?locale=ko&tab=members');expect(links[4]).toHaveAttribute('aria-current','page');expect(screen.getAllByRole('link',{name:'팬·랭킹'})).toHaveLength(1);});

it('uses the supplied verified group and membership action on legacy routes',()=>{
 state.data={page:{id:'wrong-resolver',memberCount:99},membership:null};
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='members' groupResource={{data:{page:{id:'verified-id',memberCount:2},membership:null} as any,ownerKey:'owner',retry:vi.fn()}} membershipAction={<button>original join</button>} navigationHref={tab=>`/pages/groups/verified-id?tab=${tab}&returnTo=%2Felina`}/>);
 expect(screen.getByRole('button',{name:'original join'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'팬·랭킹'})).toHaveAttribute('href','/pages/groups/verified-id?tab=members&returnTo=%2Felina');
 expect(screen.queryByRole('link',{name:'가입하기'})).toBeNull();
});

it('keeps navigation context without a hash jump or room/grade permission shortcut',()=>{
 state.data={page:{id:'local',memberCount:1},membership:null};state.query='returnTo=%2Fmy&room=original-room&month=2026-12&source=fans';
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='rooms'/>);
 expect(screen.getByRole('link',{name:'비밀방'})).toHaveAttribute('href','/elina?locale=ko&tab=rooms&returnTo=%2Fmy&room=original-room');
 expect(screen.getByRole('link',{name:'캘린더'})).toHaveAttribute('href','/elina?locale=ko&tab=calendar&returnTo=%2Fmy&month=2026-12');
 expect(screen.getByRole('link',{name:'게시판'})).toHaveAttribute('href','/elina?locale=ko&tab=board&returnTo=%2Fmy&source=fans');
 expect(screen.getByRole('link',{name:'팬·랭킹'})).toHaveAttribute('href','/elina?locale=ko&tab=members&returnTo=%2Fmy');
 state.query='';
});

it('uses the same group identity geometry for canonical brand and hobby without changing source actions',()=>{
 state.data={page:{id:'brand-id',memberCount:12},membership:null};
 const {container,unmount}=render(<CreatorGroupHeader celebrity={{...celebrity,slug:'original-brand',roles:['brand'],summary:'Original brand source'}} locale='ko' tab='home'/>);
 const brand=container.querySelector('[data-layout-family="group"]')!;
 const sharedClass=brand.className;
 expect(brand).toHaveTextContent('Original brand source');
 expect(screen.getByRole('button',{name:'bookmark'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'가입하기'}).getAttribute('href')).toContain('/pages/groups/brand-id?locale=ko&returnTo=');
 expect(screen.queryByRole('link',{name:'팬 인증'})).toBeNull();unmount();
 render(<GroupIdentityHeader name='Original hobby' locale='ko' meta='모임 · 12' actions={<button>existing membership action</button>}/>);
 expect(screen.getByRole('banner')).toHaveClass(sharedClass);
 expect(screen.getByRole('button',{name:'existing membership action'})).toBeInTheDocument();
});

it('shows an accessible first-load skeleton and preserves resolver errors',()=>{
 state.data=undefined;state.error=false;
 const view=render(<CreatorGroupActivities slug='elina' locale='ko'/>);
 expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');
 state.error=true;view.rerender(<CreatorGroupActivities slug='elina' locale='ko'/>);
 expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.queryByRole('status')).toBeNull();
 state.error=false;view.rerender(<CreatorGroupRooms slug='elina' locale='ko'/>);
 expect(screen.getByRole('heading',{name:'비밀방'})).toBeInTheDocument();expect(screen.getByRole('status')).toHaveAttribute('aria-busy','true');
});

it('renders the page menu exactly once, in the title row, when the header is compact',()=>{
 state.data={page:{id:'local',memberCount:1},membership:null};state.compact=true;
 const {container}=render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 const menus=screen.getAllByRole('button',{name:'page-menu'});
 expect(menus).toHaveLength(1);
 expect(menus[0].closest('nav')).toBeNull();
 const title=screen.getByRole('heading',{level:1});
 expect(title.parentElement!.contains(menus[0])||title.closest('header')!.contains(menus[0])).toBe(true);
 state.compact=false;
 container.remove();
});
it('places the page menu in navigation, not the title row, on wide screens',()=>{
 state.data={page:{id:'local',memberCount:1},membership:null};state.compact=false;
 render(<CreatorGroupHeader celebrity={celebrity} locale='ko' tab='home'/>);
 expect(screen.getAllByRole('button',{name:'page-menu'})).toHaveLength(1);
});
