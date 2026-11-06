import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({urls:[] as string[],loading:new Set<string>(),empty:false,authenticated:true,dialog:[] as unknown[]}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:()=>null}));
vi.mock('next/navigation',()=>import('../../../e2e/groups-local/navigation'));
vi.mock('./group-shell',()=>({GroupShell:({children}:any)=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./discovery-carousel',()=>({DiscoveryCarousel:()=><div data-testid='banners'/>}));
vi.mock('./group-application-dialog',()=>({GroupApplicationDialog:(props:unknown)=>{state.dialog.push(props);return <div role='dialog'/>;}}));
vi.mock('@/features/dukjil/ui/dukjil-provider',()=>({DukjilProvider:({children}:any)=>children,useDukjil:()=>null}));
const page=(n:number,kind='hobby')=>({id:`e9600000-0000-4000-8000-00000000000${n}`,kind,name:`Page ${n}`,description:'소개',imageUrl:null,slug:null,memberCount:n,status:'published',question:null,anonymous:false,celebrityId:null});
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({ready:true,authenticated:state.authenticated,ownerKey:'o',request:vi.fn()}),useGroupResource:(url:string|null)=>{if(url)state.urls.push(url);const base={ready:true,authenticated:state.authenticated,ownerKey:'o',error:false,retry:vi.fn(),request:vi.fn()};if(!url)return{...base,loading:false};if([...state.loading].some(part=>url.includes(part)))return{...base,loading:true};if(url.includes('/status'))return{...base,loading:false,data:{items:[]}};return{...base,loading:false,data:{items:state.empty&&url.includes('limit=20')?[]:[page(1),page(2,'brand'),page(3,'fan')],totalCount:state.empty&&url.includes('limit=20')?0:3,nextCursor:null}};}}));
import {GroupDirectory} from './group-directory';
beforeEach(()=>{state.urls.length=0;state.loading.clear();state.empty=false;state.authenticated=true;state.dialog.length=0;history.replaceState(null,'','/pages/groups');});
afterEach(cleanup);
const regions=()=>screen.getByRole('region',{name:'지금 주목할 페이지'});
it.each(['?search=Ru','?type=fan','?type=hobby','?type=fan&artistRole=idol&search=Ru','?mine=joined','?type=brand&search=없음'])('keeps the area above the list for %s',query=>{
 history.replaceState(null,'',`/pages/groups${query}`);render(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('heading',{level:1,name:'팬페이지와 모임 찾기'})).toBeInTheDocument();
 expect(screen.getByTestId('banners')).toBeInTheDocument();
 expect(within(regions()).getAllByRole('link')).toHaveLength(3);
 expect(screen.getByRole('heading',{level:2,name:'페이지 둘러보기'})).toBeInTheDocument();
 expect(screen.getByRole('group',{name:'직군'})).toBeInTheDocument();
});
it('asks for the spotlight apart from the filters, so filtering re-reads the list only',()=>{
 render(<GroupDirectory locale='ko'/>);
 const spotlight=state.urls.find(url=>url.includes('sort=today'))!;expect(spotlight).toContain('type=fan');expect(spotlight).not.toContain('search');
 state.urls.length=0;fireEvent.click(screen.getByRole('button',{name:'브랜드'}));
 expect(new Set(state.urls.filter(url=>url.includes('sort=today')))).toEqual(new Set([spotlight]));
 expect(state.urls.some(url=>url.includes('type=brand')&&url.includes('limit=20'))).toBe(true);
});
it('keeps the previous cards busy at 0.6 while another filter loads, with no skeleton',()=>{
 const {container}=render(<GroupDirectory locale='ko'/>);
 state.loading.add('type=brand');
 const before=state.urls.length;fireEvent.click(screen.getByRole('button',{name:'브랜드'}));
 expect(state.urls.slice(before).some(url=>url.includes('type=brand')&&url.includes('limit=20'))).toBe(true);
 const list=container.querySelector('[data-directory-list]')!;
 expect(list).toHaveAttribute('aria-busy');expect(within(list as HTMLElement).getAllByRole('link')).toHaveLength(3);
 expect(screen.queryByRole('status',{name:'불러오는 중'})).toBeNull();
});
it('filters by role from the all tab, and disables roles for hobby and brand',()=>{
 render(<GroupDirectory locale='ko'/>);
 const roles=screen.getByRole('group',{name:'직군'});
 fireEvent.click(within(roles).getByRole('button',{name:'아이돌'}));
 expect(state.urls.some(url=>url.includes('type=fan')&&url.includes('artistRole=idol')&&url.includes('limit=20'))).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'브랜드'}));
 expect(new URLSearchParams(location.search).get('artistRole')).toBeNull();
 const singer=within(screen.getByRole('group',{name:'직군'})).getByRole('button',{name:'가수'});
 expect(singer).toHaveAttribute('aria-disabled','true');
 fireEvent.click(singer);expect(new URLSearchParams(location.search).get('artistRole')).toBeNull();
});
it('uses the common card with a kind tag and two lines',()=>{
 const {container}=render(<GroupDirectory locale='ko'/>);
 const cards=container.querySelectorAll('[data-directory-list] [data-fan-entity]');
 expect(cards).toHaveLength(3);
 expect(cards[0]).toHaveTextContent('Page 1');expect(cards[0]).toHaveTextContent('취미');expect(cards[0]).toHaveTextContent('팬 1');
 expect(cards[0]).not.toHaveTextContent('모임 ·');expect(cards[0]).not.toHaveTextContent('소개');
});
it('offers the fan page application for an empty result, with no favorite request',()=>{
 state.empty=true;history.replaceState(null,'','/pages/groups?search=Ru&type=fan');render(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('heading',{name:'검색 결과가 없어요'})).toBeInTheDocument();
 expect(screen.queryByText('최애 요청')).toBeNull();expect(screen.queryByRole('link',{name:'최애 요청'})).toBeNull();
 expect(screen.getByRole('button',{name:'필터 초기화'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'팬페이지 개설 신청'}));
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 expect(state.dialog.at(-1)).toMatchObject({initialKind:'fan',initialName:'Ru'});
});
it('explains hobby and brand beside the page application',()=>{
 render(<GroupDirectory locale='ko'/>);
 expect(screen.getByText(/^취미: /)).toBeInTheDocument();expect(screen.getByText(/^브랜드: /)).toBeInTheDocument();
});
it('keeps the guest side area and its login paths',()=>{
 state.authenticated=false;render(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('heading',{level:2,name:'내 페이지'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'로그인'}).getAttribute('href')).toContain('/login');
 expect(screen.getByRole('link',{name:'출석체크'}).getAttribute('href')).toContain('/login');
});
