import {render,screen,within,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {GroupDirectory} from './group-directory';
const state=vi.hoisted(()=>({urls:[] as string[],pagination:false,owner:'owner',featuredMode:'ready',allLoading:false,withDataLoading:false,retry:vi.fn()}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:({onClose}:{onClose:()=>void})=><div role='dialog'><button onClick={onClose}>닫기</button></div>}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(location.search)}));
vi.mock('./group-shell',()=>({GroupShell:({children}:any)=><main>{children}</main>,GroupAvatar:()=>null}));
vi.mock('./discovery-carousel',()=>({DiscoveryCarousel:()=>null}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string)=>{state.urls.push(url);if(state.allLoading)return {ready:true,authenticated:true,ownerKey:state.owner,loading:true,error:false,retry:state.retry};if(url?.includes('sort=today')&&state.featuredMode!=='ready')return {ready:true,authenticated:true,ownerKey:state.owner,loading:state.featuredMode==='loading',error:state.featuredMode==='error',retry:state.retry,data:state.featuredMode==='empty'?{items:[],totalCount:0,nextCursor:null}:undefined};const joined=state.pagination&&url?.includes('mine=joined');const cursor=joined&&url.includes('cursor=');return {ready:true,authenticated:true,ownerKey:state.owner,loading:state.withDataLoading,data:joined?{items:[{id:cursor?'next':'first',kind:'hobby',name:cursor?'Next page':'First page',memberCount:1}],totalCount:4,nextCursor:cursor?null:'eyJ2IjoxLCJzb3J0IjoidmlzaXRlZCJ9'}:{items:[{id:'brand',kind:'brand',name:'Original brand',memberCount:30},{id:'fan',kind:'fan',slug:'nchive',celebrityId:'verified-fixture',name:'Original artist',memberCount:20},{id:'hobby',kind:'hobby',name:'Original hobby',memberCount:10}],totalCount:3,nextCursor:null}};}}));
it('separates fanpage and group labels without changing featured selection, order or identity links',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 const links=within(featured).getAllByRole('link');
 expect(links.map(link=>link.textContent)).toEqual(['Original brand모임 · 브랜드 · 30','Original artist팬페이지 · 20','Original hobby모임 · 취미 · 10']);
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

it('shows featured error and retries without changing other lists',()=>{
 history.replaceState(null,'','/pages/groups?type=all');
 state.featuredMode='error'; state.retry.mockClear();
 const view=render(<GroupDirectory locale='ko'/>);
 const featured=screen.getByRole('region',{name:'지금 주목할 페이지'});
 expect(within(featured).getByRole('alert')).toHaveTextContent('페이지 목록을 불러오지 못했어요');
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
