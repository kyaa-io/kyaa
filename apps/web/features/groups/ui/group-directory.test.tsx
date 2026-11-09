import {render,screen,within,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupDirectory} from './group-directory';
const state=vi.hoisted(()=>({urls:[] as string[],pagination:false,owner:'owner',featuredMode:'ready',joinedMode:'ready',allLoading:false,withDataLoading:false,listEmpty:false,retry:vi.fn(),challenges:[] as string[]}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:({onClose}:{onClose:()=>void})=><div role='dialog'><button onClick={onClose}>닫기</button></div>}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(location.search)}));
vi.mock('@/features/dukjil/ui/dukjil-provider',()=>({DukjilProvider:({children}:any)=>children,useDukjil:()=>null}));
vi.mock('./group-shell',()=>({GroupShell:({children}:any)=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./directory-top',()=>({MyArtists:()=>null,ThinCarousel:()=>null,HotPosts:()=>null}));
vi.mock('@/features/rankings/ui/use-ranking-resource',()=>({useRankingResource:()=>({state:{status:'ready',data:{items:state.challenges.map(slug=>({slug,name:slug,imageUrl:null,title:'t',description:'',endsOn:null,count:1,target:100}))}},retry:()=>undefined})}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string)=>{state.urls.push(url);if(url?.includes('/applications/status'))return {ready:true,authenticated:true,ownerKey:state.owner,loading:false,error:false,retry:state.retry,data:{items:[]}};if(state.allLoading)return {ready:true,authenticated:true,ownerKey:state.owner,loading:true,error:false,retry:state.retry};if(url?.includes('sort=today')&&state.featuredMode!=='ready')return {ready:true,authenticated:true,ownerKey:state.owner,loading:state.featuredMode==='loading',error:state.featuredMode==='error',retry:state.retry,data:state.featuredMode==='empty'?{items:[],totalCount:0,nextCursor:null}:undefined};if(state.listEmpty&&!url?.includes('sort=today')&&!url?.includes('mine=joined'))return {ready:true,authenticated:true,ownerKey:state.owner,loading:false,error:false,retry:state.retry,data:{items:[],totalCount:0,nextCursor:null}};if(url?.includes('mine=joined')&&state.joinedMode==='empty')return {ready:true,authenticated:true,ownerKey:state.owner,loading:false,error:false,retry:state.retry,data:{items:[],totalCount:0,nextCursor:null}};if(url?.includes('mine=joined')&&state.joinedMode!=='ready')return {ready:true,authenticated:true,ownerKey:state.owner,loading:false,error:state.joinedMode==='error',retry:state.retry,data:undefined};const joined=state.pagination&&url?.includes('mine=joined');const cursor=joined&&url.includes('cursor=');return {ready:true,authenticated:true,ownerKey:state.owner,loading:state.withDataLoading,data:joined?{items:[{id:cursor?'next':'first',kind:'hobby',name:cursor?'Next page':'First page',memberCount:1}],totalCount:4,nextCursor:cursor?null:'eyJ2IjoxLCJzb3J0IjoidmlzaXRlZCJ9'}:{items:[{id:'brand',kind:'brand',name:'Original brand',memberCount:30},{id:'fan',kind:'fan',slug:'nchive',celebrityId:'verified-fixture',name:'Original artist',memberCount:20},{id:'hobby',kind:'hobby',name:'Original hobby',memberCount:10}],totalCount:3,nextCursor:null}};}}));
it('separates fanpage and group labels without changing featured selection, order or identity links',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 const links=within(featured).getAllByRole('link');
 expect(links.map(link=>link.textContent)).toEqual(['OrOriginal brand브랜드팬 30','Original artist팬페이지팬 20','OrOriginal hobby취미팬 10']);
 expect(links[1]).toHaveAttribute('href','/nchive?locale=ko');
 expect(state.urls.some(url=>url?.includes('sort=today')&&url?.includes('limit=3'))).toBe(true);
 const groups=screen.getByRole('group',{name:'모임'});
 expect(within(groups).getByRole('button',{name:'취미'})).toBeInTheDocument();
 expect(within(groups).getByRole('button',{name:'브랜드'})).toBeInTheDocument();
 expect(within(groups).queryByRole('button',{name:'팬페이지'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'팬페이지'}));
 expect(new URLSearchParams(location.search).get('type')).toBe('fan');
});

it('opens attendance only for an ordinary click and keeps the original link',()=>{
 render(<GroupDirectory locale='ko'/>);
 const link=screen.getByRole('link',{name:'출석체크'});
 expect(link).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 fireEvent.click(link,{ctrlKey:true}); expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(link); expect(screen.getByRole('dialog')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'닫기'})); expect(screen.queryByRole('dialog')).toBeNull();
});

it('pages the personal list and resets its cursor when the account changes',()=>{
 state.pagination=true; state.owner='first-owner';
 const view=render(<GroupDirectory locale='ko'/>);
 const nav=screen.getByRole('navigation',{name:'내 페이지'});
 expect(screen.getByText('First page')).toBeInTheDocument();
 expect(screen.getByText('최근 방문순')).toBeInTheDocument();
 expect(state.urls.some(url=>url?.includes('mine=joined')&&url.includes('sort=visited')&&url.includes('limit=3'))).toBe(true);
 expect(within(nav).getByRole('button',{name:'이전'})).toBeDisabled();
 fireEvent.click(within(nav).getByRole('button',{name:'다음'}));
 expect(screen.getByText('Next page')).toBeInTheDocument();
 expect(state.urls.some(url=>url?.includes('cursor=eyJ2IjoxLCJzb3J0IjoidmlzaXRlZCJ9'))).toBe(true);
 expect(within(nav).getByRole('button',{name:'다음'})).toBeDisabled();
 fireEvent.click(within(nav).getByRole('button',{name:'이전'}));
 expect(screen.getByText('First page')).toBeInTheDocument();
 fireEvent.click(within(nav).getByRole('button',{name:'다음'}));
 state.owner='second-owner'; view.rerender(<GroupDirectory locale='ko'/>);
 expect(screen.getByText('First page')).toBeInTheDocument();
 state.pagination=false; state.owner='owner';
});

it('offers no favorite request anywhere, also when the spotlight is empty',()=>{
 history.replaceState(null,'','/pages/groups?type=all');state.featuredMode='empty';state.listEmpty=false;
 const first=render(<GroupDirectory locale='ko'/>);
 expect(screen.queryByRole('link',{name:'최애 요청'})).toBeNull();
 first.unmount();state.listEmpty=true;
 render(<GroupDirectory locale='ko'/>);
 expect(screen.queryByText('최애 요청')).toBeNull();
 expect(screen.getAllByRole('button',{name:'팬페이지 개설 신청'})).toHaveLength(1);
 state.featuredMode='ready';state.listEmpty=false;
});

it('shows featured error and retries without changing other lists',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 state.featuredMode='error'; state.retry.mockClear();
 const view=render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 expect(within(featured).getByRole('alert')).toHaveTextContent('주목할 페이지를 불러오지 못했어요');
 fireEvent.click(within(featured).getByRole('button',{name:'다시 시도'}));
 expect(state.retry).toHaveBeenCalledOnce();
 state.featuredMode='ready';view.rerender(<GroupDirectory locale='ko'/>);
 expect(within(featured).getAllByRole('link')).toHaveLength(3);
 state.featuredMode='loading';view.rerender(<GroupDirectory locale='ko'/>);
 expect(within(featured).getByRole('status')).toHaveAttribute('aria-label','불러오는 중');
 state.featuredMode='empty';view.rerender(<GroupDirectory locale='ko'/>);
 expect(within(featured).getByText('아직 표시할 페이지가 없어요.')).toBeInTheDocument();
 state.featuredMode='ready';
});

it('renders initial geometry as busy status without exposing decorative shapes',()=>{
 history.replaceState(null,'','/pages/groups?type=all');state.allLoading=true;
 render(<GroupDirectory locale='ko'/>);
 const skeletons=screen.getAllByRole('status',{name:'불러오는 중'});
 expect(skeletons).toHaveLength(3);
 for(const skeleton of skeletons){expect(skeleton).toHaveAttribute('aria-busy','true');expect(skeleton.querySelector('[aria-hidden=true]')).toBeInTheDocument();}
 state.allLoading=false;
});

it('keeps existing same-key data visible while refreshing',()=>{
 history.replaceState(null,'','/pages/groups?type=all');state.withDataLoading=true;
 render(<GroupDirectory locale='ko'/>);
 expect(within(screen.getByRole('region',{name:'지금 주목할 페이지'})).getAllByRole('link')).toHaveLength(3);
 expect(screen.queryAllByRole('status',{name:'불러오는 중'})).toHaveLength(0);
 state.withDataLoading=false;
});

it('names the failed area in each error and omits an unknown personal-page count',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 state.featuredMode='error';state.joinedMode='error';state.retry.mockClear();
 const view=render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 expect(within(featured).getByRole('alert')).toHaveTextContent('주목할 페이지를 불러오지 못했어요');
 const joinedAlert=screen.getAllByRole('alert').find(node=>node.textContent?.includes('내 페이지를 불러오지 못했어요'))!;
 expect(joinedAlert).toHaveTextContent('잠시 뒤 다시 시도해 주세요.');
 expect(within(joinedAlert).getByRole('button',{name:'다시 시도'})).toBeInTheDocument();
 expect(screen.queryByText('최근 방문순')).toBeNull();
 const all=screen.getByRole('link',{name:/내 페이지 전체 보기/});
 expect(all).toHaveTextContent(/^전체 보기$/);
 state.featuredMode='ready';state.joinedMode='nodata';view.rerender(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('link',{name:/내 페이지 전체 보기/})).toHaveTextContent(/^전체 보기$/);
 state.joinedMode='ready';state.pagination=true;view.rerender(<GroupDirectory locale='ko'/>);
 expect(screen.getByRole('link',{name:/내 페이지 전체 보기/})).toHaveTextContent('전체 보기 · 4');
 state.pagination=false;
});

it('keeps see-all and the sort caption in the joined-pages title row, not below the list',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 render(<GroupDirectory locale='ko'/>);
 const heading=screen.getByRole('heading',{level:2,name:'내 페이지'});
 const row=heading.closest('header')!;
 expect(row.tagName).toBe('HEADER');
 expect(within(row).getByText('최근 방문순')).toBeInTheDocument();
 const all=within(row).getByRole('link',{name:'내 페이지 전체 보기'});
 expect(all.getAttribute('href')).toContain('mine=joined');
 const section=row.parentElement!;
 expect(section.lastElementChild).not.toBe(all);
 expect(Array.from(section.children).filter(node=>node.tagName==='A'&&node.getAttribute('href')?.includes('mine=joined')&&!node.className.includes('joinedRow')).length).toBe(0);
});

it('shows an illustrated status empty state for zero joined pages, apart from alert errors',()=>{
 history.replaceState(null,'','/pages/groups?type=all&mine=joined');
 state.joinedMode='empty';
 const view=render(<GroupDirectory locale='ko'/>);
 const empties=screen.getAllByRole('status').filter(node=>node.textContent?.includes('아직 가입한 페이지가 없어요'));
 expect(empties.length).toBeGreaterThanOrEqual(1);
 empties.forEach(node=>expect(node.hasAttribute('data-empty-art')).toBe(true));
 expect(view.container.querySelectorAll('[data-empty-art] svg[data-kind="page"]').length).toBe(empties.length);
 expect(screen.queryByText('최근 방문순')).toBeNull();
 expect(screen.queryByRole('link',{name:/내 페이지 전체 보기/})).toBeNull();
 expect(screen.queryAllByRole('alert').filter(node=>node.textContent?.includes('불러오지 못했어요'))).toHaveLength(0);
 state.joinedMode='ready';history.replaceState(null,'','/pages/groups?type=all');
});

it('lists every page type on the all tab and asks for fans before filling the spotlight',()=>{
 history.replaceState(null,'','/pages/groups');state.urls.length=0;
 render(<GroupDirectory locale='ko'/>);
 expect(screen.queryByRole('region',{name:/^팬페이지$/})).toBeNull();
 expect(state.urls.some(url=>url?.includes('type=fan')&&url?.includes('limit=6'))).toBe(false);
 expect(state.urls.some(url=>url?.includes('type=all')&&url?.includes('limit=20'))).toBe(true);
 expect(state.urls.some(url=>url?.includes('type=nonfan'))).toBe(false);
 expect(state.urls.some(url=>url?.includes('type=fan')&&url?.includes('sort=today')&&url?.includes('limit=3'))).toBe(true);
 history.replaceState(null,'','/pages/groups?type=hobby');state.urls.length=0;
 render(<GroupDirectory locale='ko'/>);
 expect(state.urls.some(url=>url?.includes('limit=6'))).toBe(false);
});

it('updates filters with a null history state so Next re-reads the query',()=>{
 history.replaceState({__NA:true},'','/pages/groups?type=all');
 const spy=vi.spyOn(window.history,'replaceState');
 render(<GroupDirectory locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'팬페이지'}));
 expect(spy).toHaveBeenCalledTimes(1);
 expect(spy.mock.calls[0][0]).toBeNull();
 expect(location.search).toContain('type=fan');
 spy.mockRestore();
});

it('reports a re-read to Next only when the filter write passes a state without __NA (Next wrapper)',()=>{
 history.replaceState({__NA:true},'','/pages/groups?type=all');
 const native=window.history.replaceState.bind(window.history);let synced=0,skipped=0;
 const wrapper=vi.spyOn(window.history,'replaceState').mockImplementation((data:any,unused:string,url?:string|URL|null)=>{native(data,unused,url);if(data&&data.__NA)skipped++;else synced++;});
 render(<GroupDirectory locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'팬페이지'}));
 expect({synced,skipped}).toEqual({synced:1,skipped:0});
 wrapper.mockRestore();
});

it('shows only pages in the spotlight even when discovery banners exist',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 const banner={id:'b',kind:'announcement',title:'가이드 배너',description:'',ctaLabel:'보기',href:'/guide/jjinfan',alt:'대체',category:'guide',desktopImage:{id:'a',url:'/x.webp',width:1638,height:819,mimeType:'image/webp',revision:1},mobileImage:null} as any;
 render(<GroupDirectory locale='ko' banners={[banner]}/>);
 const region=screen.getByRole('region',{name:'지금 주목할 페이지'});
 expect(within(region).queryByRole('img')).toBeNull();expect(within(region).queryByText('가이드 배너')).toBeNull();
 expect(within(region).getAllByRole('link').length).toBe(3);
 expect(within(region).getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith('/guide'))).toBe(false);
});

it('tags a fan page whose 찐팬 100 challenge is on, and not the group pages',()=>{
 state.challenges=['nchive'];
 history.replaceState(null,'','/pages/groups?type=all');
 render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 const links=within(featured).getAllByRole('link');
 expect(links[1]).toHaveTextContent('찐팬 100 도전 중');
 expect(within(featured).getAllByText('찐팬 100 도전 중')).toHaveLength(1);
 state.challenges=[];
});
