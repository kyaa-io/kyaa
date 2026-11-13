import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({urls:[] as string[],loading:new Set<string>(),empty:false,authenticated:true,dialog:[] as unknown[]}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:()=>null}));
vi.mock('next/navigation',()=>import('../../../e2e/groups-local/navigation'));
vi.mock('./group-shell',()=>({GroupShell:({children}:any)=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./directory-top',()=>({MyArtists:()=><div data-testid='my-artists'/>,ThinCarousel:()=><div data-testid='banners'/>,HotPosts:()=><div data-testid='hot-posts'/>}));
vi.mock('./group-application-dialog',()=>({GroupApplicationDialog:(props:unknown)=>{state.dialog.push(props);return <div role='dialog'/>;}}));
vi.mock('@/features/dukjil/ui/dukjil-provider',()=>({DukjilProvider:({children}:any)=>children,useDukjil:()=>null}));
const page=(n:number,kind='hobby')=>({id:`e9600000-0000-4000-8000-00000000000${n}`,kind,name:`Page ${n}`,description:'소개',imageUrl:null,slug:null,memberCount:n,status:'published',question:null,anonymous:false,celebrityId:null});
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>({ready:true,authenticated:state.authenticated,ownerKey:'o',request:vi.fn()}),useGroupResource:(url:string|null)=>{if(url)state.urls.push(url);const base={ready:true,authenticated:state.authenticated,ownerKey:'o',error:false,retry:vi.fn(),request:vi.fn()};if(!url)return{...base,loading:false};if([...state.loading].some(part=>url.includes(part)))return{...base,loading:true};if(url.includes('/status'))return{...base,loading:false,data:{items:[]}};return{...base,loading:false,data:{items:state.empty&&url.includes('limit=20')?[]:[page(1),page(2,'brand'),page(3,'fan')],totalCount:state.empty&&url.includes('limit=20')?0:3,nextCursor:null}};}}));
import {GroupDirectory} from './group-directory';
beforeEach(()=>{state.urls.length=0;state.loading.clear();state.empty=false;state.authenticated=true;state.dialog.length=0;history.replaceState(null,'','/pages/groups');});
afterEach(cleanup);
it.each(['?search=Ru','?type=fan','?type=hobby','?type=fan&artistRole=idol&search=Ru','?mine=joined','?type=brand&search=없음'])('keeps the area above the list for %s',query=>{
 history.replaceState(null,'',`/pages/groups${query}`);render(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('heading',{level:1,name:'팬페이지와 모임 찾기'})).toBeInTheDocument();
 expect(screen.getByTestId('banners')).toBeInTheDocument();
 // 순서: 내 아티스트 → 얇은 배너 → Hot 게시글 → 페이지 둘러보기.
 const order=[screen.getByTestId('my-artists'),screen.getByTestId('banners'),screen.getByTestId('hot-posts'),screen.getByRole('heading',{level:2,name:'페이지 둘러보기'})];
 order.slice(1).forEach((node,i)=>expect(order[i]!.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
 expect(screen.getByRole('heading',{level:2,name:'페이지 둘러보기'})).toBeInTheDocument();
 // The type and role filters only exist while no search is typed; a search swaps them for the artists/posts tabs.
 if(query.includes('search=')){expect(screen.queryByRole('button',{name:/^활동 분야/})).toBeNull();expect(screen.getByText('게시글')).toBeInTheDocument();}
 else expect(screen.getByRole('button',{name:/^활동 분야/})).toBeInTheDocument();
});
it('draws the h1 with FanHeading so the one page-title size (26/800) applies',()=>{
 render(<GroupDirectory locale='ko'/>);
 const h1=screen.getByRole('heading',{level:1,name:'팬페이지와 모임 찾기'});
 expect(h1).toHaveAttribute('data-fan-heading','standard');
});
it('reads the list only, so filtering re-reads one list and asks for no spotlight pages',()=>{
 render(<GroupDirectory locale='ko'/>);
 state.urls.length=0;fireEvent.click(screen.getByRole('button',{name:'브랜드'}));
 expect(state.urls.some(url=>url.includes('sort=today'))).toBe(false);
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
it('keeps search, sort and every filter in two rows: the roles sit in one menu chip at the end of the filter row',()=>{
 const {container}=render(<GroupDirectory locale='ko'/>);
 const bar=container.querySelector('[aria-label="페이지 둘러보기"]:not(section)')!;
 expect([...bar.querySelectorAll('button')].map(button=>button.textContent)).toEqual(['전체','팬페이지','취미','브랜드','활동 분야']);
 expect(within(bar as HTMLElement).getByRole('group',{name:'모임'})).toBeInTheDocument();
});
it('filters by role from the all tab through the role menu, and disables it for hobby and brand',async()=>{
 render(<GroupDirectory locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'활동 분야: 전체'}));
 fireEvent.click(await screen.findByRole('menuitemradio',{name:'아이돌'}));
 await waitFor(()=>expect(screen.queryByRole('menuitemradio',{name:'아이돌'})).not.toBeInTheDocument());
 expect(new URLSearchParams(location.search).get('artistRole')).toBe('idol');
 expect(state.urls.some(url=>url.includes('type=fan')&&url.includes('artistRole=idol')&&url.includes('limit=20'))).toBe(true);
 const trigger=screen.getByRole('button',{name:'활동 분야: 아이돌'});expect(trigger).toHaveTextContent('아이돌');expect(trigger).toHaveAttribute('data-active');
 fireEvent.click(screen.getByRole('button',{name:'브랜드'}));
 expect(new URLSearchParams(location.search).get('artistRole')).toBeNull();
 expect(screen.getByRole('button',{name:'활동 분야: 전체'})).toBeDisabled();
});
it('uses the common card with a kind tag and two lines',()=>{
 const {container}=render(<GroupDirectory locale='ko'/>);
 const cards=container.querySelectorAll('[data-directory-list] [data-fan-entity]');
 expect(cards).toHaveLength(3);
 expect(cards[0]).toHaveTextContent('Page 1');expect(cards[0]).toHaveTextContent('취미');expect(cards[0]).not.toHaveTextContent('팬 1');
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
it('offers two illustrated application banners with their existing destinations',()=>{
 const {container}=render(<GroupDirectory locale='ko'/>);
 const area=container.querySelector('[class*=discoveryCreation]') as HTMLElement;
 const rows=within(area).getAllByRole('link');
 expect(rows.map(row=>row.querySelector('img')?.getAttribute('src'))).toEqual(['/images/groups/create-fan.webp','/images/groups/create-hobby.webp']);
 expect(within(area).getByRole('link',{name:'팬페이지 개설 신청'})).toBe(rows[0]);expect(within(area).getByRole('link',{name:'취미·브랜드 페이지 개설 신청'})).toBe(rows[1]);
 expect(rows[0]).toHaveAttribute('href','/pages/groups/apply?locale=ko&kind=fan');
 expect(rows[1]).toHaveAttribute('href','/pages/groups/apply?locale=ko');
 expect(area.textContent).toContain('팬페이지 개설 신청');
 expect(area.textContent).not.toContain('신청해요');
 expect(within(area).queryByRole('heading')).toBeNull();
 expect(screen.queryByRole('button',{name:/^자세히/})).toBeNull();
 expect(screen.queryByText(/만들고 싶나요/)).toBeNull();
 fireEvent.click(rows[1]);
 expect(state.dialog.at(-1)).toMatchObject({initialKind:'hobby'});
});
it('keeps the guest side area and its login paths',()=>{
 state.authenticated=false;render(<GroupDirectory locale='ko'/>);
 expect(screen.queryByRole('heading',{level:2,name:'내 페이지'})).toBeNull();
 expect(screen.getByRole('link',{name:'출석체크'}).getAttribute('href')).toContain('/login');
});
it.each(['all','fan'])('uses discovery only for the default %s list',type=>{
 history.replaceState(null,'',`/pages/groups?type=${type}`);const view=render(<GroupDirectory locale='ko'/>);
 expect(state.urls.some(url=>url.includes('limit=20')&&url.includes('sort=discovery'))).toBe(true);view.unmount();state.urls.length=0;
 history.replaceState(null,'',`/pages/groups?type=${type}&sort=popular`);render(<GroupDirectory locale='ko'/>);
 expect(state.urls.some(url=>url.includes('limit=20')&&url.includes('sort=popular'))).toBe(true);
 expect(state.urls.some(url=>url.includes('limit=20')&&url.includes('sort=discovery'))).toBe(false);
});
it('preserves a direct non-default order instead of forcing discovery',()=>{
 history.replaceState(null,'','/pages/groups?sort=today');render(<GroupDirectory locale='ko'/>);
 expect(state.urls.some(url=>url.includes('limit=20')&&url.includes('sort=today'))).toBe(true);
});
