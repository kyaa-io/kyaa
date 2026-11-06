import {render,screen,fireEvent} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupDetailScreen} from './group-detail';
const fixtureCreator={slug:'nchive',name:'NCHIVE',summary:'요약 원문',roles:['idol'],image:{url:'/fixture.png'},socialLinks:[]};
const state=vi.hoisted(()=>({page:{id:'page-id',kind:'fan',slug:'nchive',celebrityId:'creator-id',name:'NCHIVE',description:'원문',memberCount:1} as any,creator:null as any,error:false,query:''}));
vi.mock('next/navigation',async importOriginal=>({...await importOriginal<typeof import('next/navigation')>(),useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock('@/features/content-safety/ui/use-automatic-translation',()=>({TranslatedText:({text}:any)=>text}));
vi.mock('@/components/fan-ui/use-owned-fan-resource',()=>({useOwnedFanResource:()=>({state:{status:'loading'},retry:vi.fn()})}));
vi.mock('./use-group-resource',()=>({GroupRequestError:class extends Error{},useGroupRequest:()=>({request:()=>Promise.reject(new Error('no catalog')),authenticated:true,ready:true,ownerKey:'u'}),useGroupResource:(url:string|null)=>({data:url?.startsWith('/api/groups/')?{page:state.page,membership:null}:state.creator,error:state.error,ownerKey:'owner',retry:vi.fn(),authenticated:false})}));
vi.mock('./group-shell',async importOriginal=>({...await importOriginal<typeof import('./group-shell')>(),GroupShell:({children}:any)=><main>{children}</main>}));
vi.mock('./linked-fanpage-content',()=>({LinkedFanpageContent:({view,celebrity}:any)=><section>{celebrity.slug} shared {view}</section>}));
vi.mock('@/features/group-wallet/ui/wallet-screen',()=>({WalletAttendanceDialog:({onClose}:{onClose:()=>void})=><div role='dialog'><button onClick={onClose}>닫기</button></div>}));
vi.mock('./group-presence',()=>({GroupPresence:()=>null}));
vi.mock('./group-page-menu',()=>({GroupPageMenu:()=>null,useCompactHeader:()=>false}));
vi.mock('./group-members',()=>({GroupMembers:({member}:any)=><section>members:{String(member)}</section>}));
vi.mock('./group-board',()=>({GroupBoard:({initialPostId}:any)=><section>legacy post:{initialPostId}</section>}));
vi.mock('./group-home-panels',()=>({GroupHomeInfo:()=>null,GroupBrandHomeEvent:()=>null}));
beforeEach(()=>{state.page={id:'page-id',kind:'fan',slug:'nchive',celebrityId:'creator-id',name:'NCHIVE',description:'원문',memberCount:1};state.creator={...fixtureCreator};state.error=false;state.query='';});
it('uses common fan home and preserves room/month/returnTo URLs',()=>{
 state.query='room=room-id&month=2026-11&returnTo=%2Fnchive%3Ftab%3Dhome';render(<GroupDetailScreen pageId='page-id' locale='ko' initialRoomId='room-id' calendarMonth='2026-11' initialReturnTo='/nchive?tab=home'/>);
 expect(screen.getByText('nchive shared home')).toBeInTheDocument();
 const room=new URL(screen.getByRole('link',{name:'비밀방'}).getAttribute('href')!,'https://kyaa.test');expect(room.searchParams.get('room')).toBe('room-id');expect(room.searchParams.get('returnTo')).toBe('/nchive?tab=home');
 expect(new URL(screen.getByRole('link',{name:'캘린더'}).getAttribute('href')!,'https://kyaa.test').searchParams.get('month')).toBe('2026-11');
});
it('keeps original legacy post ID/source rather than recasting as fan_post',()=>{
 state.query='post=original-id&search=term';render(<GroupDetailScreen pageId='page-id' locale='ko' tab='board' initialPostId='original-id' initialBoardState={{search:'term'}}/>);
 expect(screen.getByText('legacy post:original-id')).toBeInTheDocument();
 expect(new URL(screen.getByRole('link',{name:'게시판'}).getAttribute('href')!,'https://kyaa.test').searchParams.get('post')).toBe('original-id');
});
it('reuses fan feed for board without a legacy post',()=>{render(<GroupDetailScreen pageId='page-id' locale='ko' tab='board'/>);expect(screen.getByText('nchive shared board')).toBeInTheDocument();});
it('keeps membership permission input on member screen',()=>{render(<GroupDetailScreen pageId='page-id' locale='ko' tab='members'/>);expect(screen.getByText('members:false')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'NCHIVE',level:1})).toBeInTheDocument();});
it.each(['hobby','brand'])('preserves %s identity instead of fan shell',kind=>{state.page.kind=kind;render(<GroupDetailScreen pageId='page-id' locale='ko'/>);expect(screen.getByRole('heading',{name:'NCHIVE',level:1})).toBeInTheDocument();expect(screen.queryByText('nchive shared home')).toBeNull();});
it.each(['missing-link','mismatch','brand'])('does not fall back to generic fan identity for %s',kind=>{if(kind==='missing-link')state.page.celebrityId=null;else if(kind==='mismatch')state.creator.slug='elina';else state.creator.roles=['brand'];render(<GroupDetailScreen pageId='page-id' locale='ko'/>);expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.queryByRole('heading')).toBeNull();});

it('does not reveal cached fan content after access failure',()=>{state.error=true;render(<GroupDetailScreen pageId='page-id' locale='ko'/>);expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.queryByText('nchive shared home')).toBeNull();expect(screen.queryByRole('heading')).toBeNull();});

it('rejects a detail response for another entity ID',()=>{state.page.id='another-id';render(<GroupDetailScreen pageId='page-id' locale='ko'/>);expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.queryByText('nchive shared home')).toBeNull();});

it('opens hobby attendance without changing its native link or modified click',async()=>{
 state.page.kind='hobby';render(<GroupDetailScreen pageId='page-id' locale='ko'/>);
 const link=screen.getByRole('link',{name:'출석체크'});expect(link).toHaveAttribute('href','/my/wallet?view=attendance&locale=ko');
 fireEvent.click(link,{ctrlKey:true});expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(link);expect(await screen.findByRole('dialog')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'닫기'}));expect(screen.queryByRole('dialog')).toBeNull();
});
