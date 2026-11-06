import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import {clearResources} from "@/components/fan-ui/resource-cache";
import { beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { groupApiQuery, groupHref, groupListSchema } from "../domain/contracts";
import { groupsCopy } from "./copy";
import { GroupApplicationHistory } from "./group-application-history";
import { GroupApplication } from "./group-application";
import { GroupPageMenu } from "./group-page-menu";
import { GroupManagementMembers } from "./group-management-members";
import { GroupBoard } from "./group-board";
import { GroupRoomsPanel,GroupDetailScreen } from "./group-detail";
import { GroupDirectory } from "./group-directory";
import { GroupRequestError, useGroupRequest } from "./use-group-resource";
vi.mock('next/navigation',()=>import('../../../e2e/groups-local/navigation'));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},getAccessToken:vi.fn(async()=> 'token-a')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'owner-a',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:React.ReactNode})=><main>{children}</main>,GroupAvatar:()=>null}));
const page={id:'10000000-0000-4000-8000-000000000001',kind:'hobby' as const,celebrityId:null,slug:null,name:'한강 러닝',description:'함께 달려요',imageUrl:null,question:null,memberCount:84};
beforeEach(()=>{session.ownerId='owner-a';session.generation=0;auth.authenticated=true;auth.ready=true;auth.getAccessToken.mockReset().mockResolvedValue('token-a');});
it('keeps all supported language labels complete',()=>{for(const locale of APP_LOCALES)expect(Object.values(groupsCopy(locale)).every(value=>typeof value==='string'&&value.length>0)).toBe(true);});
it('preserves creator URLs and encodes filtered discovery requests',()=>{expect(groupHref({...page,kind:'fan',celebrityId:page.id,slug:'nchive'},'ko')).toBe('/nchive?locale=ko');expect(groupApiQuery({search:'런 & 뮤직',mine:'joined'})).toContain('search=%EB%9F%B0+%26+%EB%AE%A4%EC%A7%81');expect(groupListSchema.safeParse({items:[{...page,memberCount:-1}],nextCursor:null}).success).toBe(false);});
it('does not call a submission created before the session changed',async()=>{let resolve:(value:string)=>void=()=>{};auth.getAccessToken.mockImplementationOnce(()=>new Promise<string>(r=>{resolve=r;}));const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);const hook=renderHook(()=>useGroupRequest());let pending:Promise<unknown>=Promise.resolve();act(()=>{pending=hook.result.current.request('/api/groups/applications',{method:'POST'});});await waitFor(()=>expect(auth.getAccessToken).toHaveBeenCalled());session.ownerId='owner-b';session.generation++;hook.rerender();resolve('token-b');await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(fetchMock).not.toHaveBeenCalled();});
it('retains the structured server rejection',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'INSUFFICIENT_BALANCE'}},{status:409})));const hook=renderHook(()=>useGroupRequest());await expect(hook.result.current.request('/api/me/wallet/exchange',{method:'POST'})).rejects.toBeInstanceOf(GroupRequestError);await expect(hook.result.current.request('/api/me/wallet/exchange',{method:'POST'})).rejects.toMatchObject({status:409,code:'INSUFFICIENT_BALANCE'});});
it('shows request received rather than implying the page already exists',async()=>{const requests:Record<string,unknown>[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,input:RequestInit)=>{requests.push(JSON.parse(input.body as string));return Response.json({id:page.id,status:'submitted',pageId:null});}));render(<GroupApplication locale='ko'/>);fireEvent.change(screen.getByLabelText('페이지 이름'),{target:{value:'한강 러닝'}});fireEvent.change(screen.getByLabelText('페이지 소개'),{target:{value:'함께 달려요'}});fireEvent.click(screen.getByRole('button',{name:'페이지 개설 신청'}));expect(await screen.findByRole('heading',{name:'신청 접수'})).toBeInTheDocument();expect(requests[0]).toMatchObject({kind:'hobby',name:'한강 러닝'});expect(requests[0].requestId).toEqual(expect.any(String));expect(screen.queryByText('가입하기')).not.toBeInTheDocument();});
it('loads actual discovery cards and performs a submitted search',async()=>{const urls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json({items:[page],nextCursor:null});}));render(<GroupDirectory locale='ko'/>);await waitFor(()=>expect(screen.getAllByText('한강 러닝').length).toBeGreaterThan(0));fireEvent.change(screen.getByRole('textbox',{name:'페이지 이름이나 관심사 검색'}),{target:{value:'사진'}});fireEvent.click(screen.getByRole('button',{name:'검색'}));await waitFor(()=>expect(urls.some(url=>url.includes('search=%EC%82%AC%EC%A7%84'))).toBe(true));expect(new URLSearchParams(window.location.search).get('search')).toBe('사진');});

it('continues room history after the first page instead of polling the same first 50 messages',async()=>{
 const roomId='20000000-0000-4000-8000-000000000001';const profileId='30000000-0000-4000-8000-000000000001';
 const messages=Array.from({length:51},(_,i)=>({id:`40000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,body:`메시지 ${i+1}`,profileId,nickname:'팬',createdAt:'2026-11-01T10:00:00Z'}));
 const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);if(url.endsWith('/rooms'))return Response.json({items:[{id:roomId,name:'함께하는 방',minimumTier:'Gold',status:'open',canEnter:true}]});return Response.json({items:url.includes('after=')?[messages[50]]:messages.slice(0,50)});}));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/함께하는 방/}));expect(await screen.findByText('메시지 51')).toBeInTheDocument();expect(urls.some(url=>url.includes(`after=${messages[49].id}`))).toBe(true);
});

it('preserves the original comment body and request key after a failed submission',async()=>{
 const post={id:page.id,pageId:page.id,title:'우리 모임 첫 글',body:'함께 이야기해요.',visibility:'public',anonymous:false,profileId:page.id,nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T10:00:00Z',commentCount:0,viewCount:1,likeCount:0,liked:false,canEdit:true,canDelete:true};
 const writes:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{if(url.includes('/comments')){if(input?.method==='POST'){writes.push(JSON.parse(input.body as string));if(writes.length===1)throw new TypeError('offline');return Response.json({id:page.id});}return Response.json({items:[],nextCursor:null});}if(url.includes('/posts?'))return Response.json({items:[post],nextCursor:null});return Response.json(post);}));
 render(<GroupBoard detail={{page,membership:{role:'member',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false}} locale='ko'/>);
 fireEvent.click(await screen.findByRole('button',{name:/우리 모임 첫 글/}));expect(await screen.findByText('함께 이야기해요.')).toBeInTheDocument();fireEvent.change(screen.getByRole('textbox',{name:'댓글'}),{target:{value:'반가워요'}});fireEvent.click(screen.getByRole('button',{name:'보내기'}));await screen.findByRole('alert');expect(screen.getByRole('textbox',{name:'댓글'})).toHaveValue('반가워요');fireEvent.click(screen.getByRole('button',{name:'보내기'}));await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]).toEqual(writes[0]);
});

it('shows reviewer notes and retries a revised application with the same request key',async()=>{
 const writes:Record<string,unknown>[]=[];const item={id:page.id,kind:'hobby',name:page.name,description:page.description,question:null,status:'changes_requested',reason:'모임 소개를 보완해 주세요.',created_at:'2026-11-01T10:00:00Z'};
 vi.stubGlobal('fetch',vi.fn(async(_url:string,input?:RequestInit)=>{if(input?.method==='PATCH'){writes.push(JSON.parse(input.body as string));if(writes.length===1)throw new TypeError('offline');return Response.json({id:page.id,status:'submitted',pageId:null});}return Response.json({items:[item],nextCursor:null});}));
 render(<GroupApplicationHistory locale='ko'/>);await screen.findByText(item.reason);fireEvent.change(screen.getByRole('textbox',{name:'페이지 소개'}),{target:{value:'매주 주말 아침 함께 달려요.'}});fireEvent.click(screen.getByRole('button',{name:'보완하여 다시 신청'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'보완하여 다시 신청'}));await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]).toEqual(writes[0]);expect(writes[0].description).toBe('매주 주말 아침 함께 달려요.');
});

it('shows a real entry condition action instead of a disabled private room',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id:page.id,name:'아티스트와 함께',minimumTier:'Gold',status:'open',canEnter:false,latestMessage:null,unreadCount:null}]})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);fireEvent.click(await screen.findByRole('button',{name:/아티스트와 함께/}));expect(screen.getByRole('link',{name:'팬 인증'})).toHaveAttribute('href','/nchive?locale=ko&tab=certifications');expect(screen.getByText('멤버 전용 콘텐츠를 볼 수 없어요')).toBeInTheDocument();
});
it('keeps the previous notification value when saving fails',async()=>{
 const proto=HTMLDialogElement.prototype,show=Object.getOwnPropertyDescriptor(proto,'showModal'),close=Object.getOwnPropertyDescriptor(proto,'close');
 Object.defineProperty(proto,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(proto,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
 const writes:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,input?:RequestInit)=>{if(input?.method==='PUT'){writes.push(JSON.parse(input.body as string));throw new TypeError('offline');}return Response.json({enabled:true});}));
 const view=render(<GroupPageMenu detail={{page,membership:{role:'member',joinedAt:'2026-11-01T10:00:00Z'},bookmarked:false}} locale='ko' refresh={()=>{}}/>);
 try{fireEvent.click(view.container.querySelector('summary')!);fireEvent.click(await screen.findByRole('button',{name:'모임 알림 설정'}));const toggle=screen.getByRole('checkbox',{name:'모임 공지 받기'});fireEvent.click(toggle);fireEvent.click(screen.getByRole('button',{name:'설정 저장'}));await screen.findByRole('alert');expect(toggle).not.toBeChecked();expect(writes).toEqual([{notices:false,events:true,recipients:true,activity:true}]);fireEvent.click(screen.getByRole('button',{name:'취소'}));fireEvent.click(view.container.querySelector('summary')!);fireEvent.click(await screen.findByRole('button',{name:'모임 알림 설정'}));expect(screen.getByRole('checkbox',{name:'모임 공지 받기'})).toBeChecked();}
 finally{view.unmount();if(show)Object.defineProperty(proto,'showModal',show);else Reflect.deleteProperty(proto,'showModal');if(close)Object.defineProperty(proto,'close',close);else Reflect.deleteProperty(proto,'close');}
});
it('reopens a shared post URL with the original list filters',async()=>{
 const post={id:page.id,pageId:page.id,title:'공유된 글',body:'원래 글',visibility:'public',anonymous:false,profileId:page.id,nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T10:00:00Z'};const urls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return Response.json(url.includes('/comments')?{items:[],nextCursor:null}:url.includes('/posts?')?{items:[post],nextCursor:null}:post);}));
 render(<GroupBoard detail={{page,membership:null,bookmarked:false}} locale='ko' initialPostId={page.id} initialBoardState={{category:'free',search:'달리기',sort:'popular'}}/>);await screen.findByRole('heading',{name:'공유된 글'});fireEvent.click(screen.getByRole('button',{name:'목록으로'}));expect(location.search).toContain('category=free');expect(new URLSearchParams(location.search).get('search')).toBe('달리기');expect(urls.some(url=>url.includes('sort=popular'))).toBe(true);
});

it('rejects external and normalized non-API request URLs before requesting a bearer',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const hook=renderHook(()=>useGroupRequest());
 for(const url of ['https://example.com/api/groups','//example.com/api/groups','/api/../../outside','/api/%2e%2e/outside','/api/\\example.com','/api/groups\n'])await expect(hook.result.current.request(url)).rejects.toMatchObject({code:'GROUP_REQUEST_URL_INVALID'});
 expect(fetch).not.toHaveBeenCalled();expect(auth.getAccessToken).not.toHaveBeenCalled();
});

it.each(['closed','scheduled'])('shows room lifecycle before membership conditions for %s rooms',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id:page.id,name:'주말 방',minimumTier:null,status,canEnter:false,opensAt:status==='scheduled'?'2026-12-01T09:00:00Z':null}]})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/주말 방/}));expect(screen.getByRole('heading',{name:status==='closed'?'종료된 비밀방':'예약'})).toBeInTheDocument();expect(screen.queryByText('참여 조건')).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'가입하기'})).not.toBeInTheDocument();
});

it.each([403,404])('offers exploration instead of permanent retry for unavailable shared page %s',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'GROUP_NOT_FOUND'}},{status})));
 render(<GroupDetailScreen pageId={page.id} locale='ko'/>);expect(await screen.findByRole('heading',{name:'페이지를 열 수 없어요'})).toBeInTheDocument();expect(screen.getByRole('link',{name:'페이지 둘러보기'})).toHaveAttribute('href','/pages/groups?locale=ko');expect(screen.queryByRole('button',{name:'다시 시도'})).not.toBeInTheDocument();expect(screen.queryByText(page.name)).not.toBeInTheDocument();
});

it('renders actual management tier and detail values without borrowing sample statistics',async()=>{
 const member='30000000-0000-4000-8000-000000000001';vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{profileId:member,nickname:'하늘',avatarUrl:null,role:'member',answer:'무대 이야기를 나누고 싶어요',tier:'Gold',joinedAt:null,lastActiveAt:null,postCount:12,commentCount:36}],nextCursor:null})));
 render(<GroupManagementMembers detail={{page,membership:{role:'owner',joinedAt:'2026-11-01T00:00:00Z'},bookmarked:false}} locale='ko' refresh={()=>{}}/>);expect(await screen.findByRole('table')).toBeInTheDocument();expect(await screen.findByText('무대 이야기를 나누고 싶어요')).toBeInTheDocument();expect(screen.getByText('12')).toBeInTheDocument();expect(screen.getByText('36')).toBeInTheDocument();expect(screen.getByText('Gold · 변경 불가')).toBeInTheDocument();
});
it('keeps home board preview compact while the full board retains filters and search',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[],nextCursor:null})));const detail={page,membership:{role:'member' as const,joinedAt:'2026-11-01T00:00:00Z'},bookmarked:false};
 const view=render(<GroupBoard detail={detail} locale='ko' preview/>);expect(screen.getByRole('heading',{name:'공지·이야기'})).toBeInTheDocument();expect(screen.queryByRole('textbox',{name:'검색'})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'전체 보기'})).toHaveAttribute('href',`/pages/groups/${page.id}?locale=ko&tab=board`);view.rerender(<GroupBoard detail={detail} locale='ko'/>);expect(screen.getByRole('textbox',{name:'검색'})).toBeInTheDocument();
});

it('refreshes shared balances only after a confirmed response',async()=>{
 const listener=vi.fn();window.addEventListener('kyaa:group-wallet-changed',listener);
 try{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})));const hook=renderHook(()=>useGroupRequest());await hook.result.current.request('/api/me/wallet/exchange',{method:'POST'});expect(listener).toHaveBeenCalledTimes(1);await hook.result.current.request('/api/me/wallet');expect(listener).toHaveBeenCalledTimes(1);vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('Network lost');}));await expect(hook.result.current.request('/api/me/wallet/exchange',{method:'POST'})).rejects.toThrow();expect(listener).toHaveBeenCalledTimes(1);}finally{window.removeEventListener('kyaa:group-wallet-changed',listener);}
});

it('shows the full matching total while rendering only the current directory page',async()=>{
 window.history.replaceState(null,'','/pages/groups');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[page],nextCursor:page.id,totalCount:14})));
 render(<GroupDirectory locale='ko'/>);
 expect(await screen.findByText('전체 14')).toBeVisible();
 expect(screen.queryByText('전체 1+')).not.toBeInTheDocument();
});

it('shows up to three top pages of the day in the discovery spotlight',async()=>{
 window.history.replaceState(null,'','/pages/groups');
 const items=Array.from({length:4},(_,i)=>({...page,id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:`모임 ${i+1}`}));
 const fetchMock=vi.fn(async(_url:string)=>Response.json({items,nextCursor:null}));vi.stubGlobal('fetch',fetchMock);
 render(<GroupDirectory locale='ko'/>);
 const section=await screen.findByRole('region',{name:'지금 주목할 페이지'});
 expect(section.querySelectorAll('a')).toHaveLength(3);
 expect(section).toHaveTextContent('모임 1');expect(section).not.toHaveTextContent('모임 4');
 expect(fetchMock.mock.calls.some(([url])=>{const q=new URL(String(url),'http://localhost').searchParams;return q.get('sort')==='today'&&q.get('limit')==='3';})).toBe(true);
});

it('hides an empty application history without hiding a fetch error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[],nextCursor:null})));
 const view=render(<GroupApplicationHistory locale='ko'/>);
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'신청 내역'})).not.toBeInTheDocument());
 view.unmount();clearResources();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'UNAVAILABLE'}},{status:503})));
 render(<GroupApplicationHistory locale='ko'/>);
 expect(await screen.findByRole('alert')).toBeVisible();
 expect(screen.getByRole('button',{name:'다시 시도'})).toBeVisible();
});

it('keeps hobby and brand application choices separate from the artist application entry',()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[],nextCursor:null})));
 const view=render(<GroupApplication locale='ko'/>);
 expect(screen.getByRole('radio',{name:'취미'})).toBeChecked();
 expect(screen.getByRole('radio',{name:'브랜드'})).toBeVisible();
 expect(screen.queryByRole('radio',{name:'팬'})).not.toBeInTheDocument();
 view.unmount();render(<GroupApplication locale='ko' initialKind='fan'/>);
 expect(screen.getByRole('radio',{name:'팬'})).toBeChecked();
 expect(screen.queryByRole('radio',{name:'취미'})).not.toBeInTheDocument();
});

it('does not expose a locked room preview or request its messages',async()=>{
 const fetcher=vi.fn(async()=>Response.json({items:[{id:page.id,name:'잠긴 방',minimumTier:'Gold',status:'open',canEnter:false,latestMessage:'비공개 대화',unreadCount:9}]}));vi.stubGlobal('fetch',fetcher);
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);fireEvent.click(await screen.findByRole('button',{name:/잠긴 방/}));expect(screen.queryByText('비공개 대화')).not.toBeInTheDocument();expect(screen.queryByText('9')).not.toBeInTheDocument();expect(fetcher.mock.calls).toHaveLength(1);
});

it('shows empty conversations and expands entry requirements without loading messages',async()=>{
 const fetcher=vi.fn(async()=>Response.json({items:[{id:page.id,name:'응원 이야기',minimumTier:'Gold',status:'open',canEnter:true,latestMessage:null,unreadCount:0}]}));vi.stubGlobal('fetch',fetcher);
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);await screen.findByText('아직 대화가 없어요.');expect(screen.getByText('팬 인증 완료 · Gold 이상')).toBeInTheDocument();const action=screen.getByRole('button',{name:'입장 조건 확인'});fireEvent.click(action);expect(action).toHaveAttribute('aria-expanded','true');expect(screen.getByRole('link',{name:'팬 인증'})).toHaveAttribute('href','/nchive?locale=ko&tab=certifications');expect(fetcher.mock.calls).toHaveLength(1);
});

it.each([401,403,404,503])('provides the appropriate room action for HTTP %s',async status=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).endsWith('/public-rooms')?Response.json({roomCount:0,items:[]}):Response.json({error:{code:status===401?'AUTHENTICATION_REQUIRED':status===403?'GROUPS_FORBIDDEN':status===404?'GROUPS_NOT_FOUND':'GROUPS_UNAVAILABLE'}},{status})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);if(status===403)await screen.findByRole('link',{name:'가입하기'});else await screen.findByRole('alert');
 if(status===401)expect(screen.getByRole('link',{name:'로그인'})).toHaveAttribute('href','/login?locale=ko&returnTo=%2Fnchive%3Flocale%3Dko%26tab%3Drooms');
 if(status===403)expect(screen.getByRole('link',{name:'가입하기'})).toHaveAttribute('href','/nchive?locale=ko');
 if(status===404)expect(screen.getByRole('link',{name:'페이지 둘러보기'})).toHaveAttribute('href','/pages/groups?locale=ko');
 if(status===503)expect(screen.getByRole('button',{name:'다시 시도'})).toBeInTheDocument();
 else expect(screen.queryByRole('button',{name:'다시 시도'})).not.toBeInTheDocument();
});

it('keeps a failed room draft and reuses its request key on retry',async()=>{
 const writes:Record<string,unknown>[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,input?:RequestInit)=>{
  if(url.endsWith('/rooms'))return Response.json({items:[{id:page.id,name:'아티스트와 함께',minimumTier:'Gold',status:'open',canEnter:true}]});
  if(input?.method==='POST'&&url.endsWith('/messages')){writes.push(JSON.parse(String(input.body)));if(writes.length===1)throw new TypeError('offline');return Response.json({id:page.id});}
  return Response.json({items:[{id:page.id,profileId:page.id,nickname:'팬',body:'기존 메시지',createdAt:'2026-11-01T10:00:00Z',mine:true}]});
 }));render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/아티스트와 함께/}));await screen.findByText('기존 메시지');fireEvent.change(screen.getByRole('textbox',{name:'메시지'}),{target:{value:'내일 무대도 기대할게요!'}});fireEvent.click(screen.getByRole('button',{name:'보내기'}));await screen.findByRole('alert');expect(screen.getByRole('textbox',{name:'메시지'})).toHaveValue('내일 무대도 기대할게요!');fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]).toEqual(writes[0]);await waitFor(()=>expect(screen.getByRole('textbox',{name:'메시지'})).toHaveValue(''));fireEvent.click(screen.getByRole('button',{name:'비밀방'}));expect(screen.getByRole('heading',{name:'비밀방'})).toBeInTheDocument();
});

it('renders server-provided artist identity and room participants',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/rooms')?{items:[{id:page.id,name:'함께하는 방',minimumTier:'Gold',status:'open',canEnter:true}]}:{items:[{id:page.id,profileId:page.id,nickname:'아티스트',body:'함께해요',createdAt:'2026-11-01T10:00:00Z',artist:true,avatarUrl:'/images/avatars/star-pink.webp'}],participants:[{profileId:page.id,nickname:'하늘',avatarUrl:null,tier:'Gold'}]})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/함께하는 방/}));await screen.findByText('인증 아티스트');expect(screen.getByRole('heading',{name:'참여 팬'})).toBeInTheDocument();expect(screen.getByRole('link',{name:/하늘/})).toHaveAttribute('href',`/my/friends?locale=ko&profileId=${page.id}`);
});

it.each([{status:'readonly',canSend:true,shown:true},{status:'readonly',canSend:false,shown:false},{status:'readonly',canSend:undefined,shown:false},{status:'open',canSend:false,shown:false},{status:'open',canSend:undefined,shown:true}])('uses current room permission $status/$canSend',async({status,canSend,shown})=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/rooms')?{items:[{id:page.id,name:'권한 확인 방',minimumTier:null,status,canEnter:true}]}:{items:[],canSend})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/권한 확인 방/}));await screen.findByText('아직 대화가 없어요.');
 expect(Boolean(screen.queryByRole('textbox',{name:'메시지'}))).toBe(shown);
});
it('revokes composing permission on an empty room refresh',async()=>{
 let canSend=true;vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/rooms')?{items:[{id:page.id,name:'권한 확인 방',minimumTier:null,status:'open',canEnter:true}]}:{items:[],canSend})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/권한 확인 방/}));await screen.findByRole('textbox',{name:'메시지'});canSend=false;fireEvent(document,new Event('visibilitychange'));await waitFor(()=>expect(screen.queryByRole('textbox',{name:'메시지'})).not.toBeInTheDocument());
});
it('keeps composing disabled after access denial followed by a network failure',async()=>{
 let phase=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.endsWith('/rooms'))return Response.json({items:[{id:page.id,name:'권한 확인 방',minimumTier:null,status:'open',canEnter:true}]});
  if(phase===1)return Response.json({error:{code:'GROUPS_FORBIDDEN'}},{status:403});
  if(phase===2)throw new TypeError('offline');
  return Response.json({items:[],canSend:true});
 }));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);fireEvent.click(await screen.findByRole('button',{name:/권한 확인 방/}));await screen.findByRole('textbox',{name:'메시지'});
 phase=1;fireEvent(document,new Event('visibilitychange'));await waitFor(()=>expect(screen.queryByRole('textbox',{name:'메시지'})).not.toBeInTheDocument());
 phase=2;fireEvent(document,new Event('visibilitychange'));await screen.findByRole('alert');expect(screen.queryByRole('textbox',{name:'메시지'})).not.toBeInTheDocument();
});

it.each([true,false])('selects a linked room only through current room permissions: %s',async(canEnter)=>{
 const roomId='20000000-0000-4000-8000-000000000001';const fetcher=vi.fn(async(url:string)=>url.endsWith('/rooms')?Response.json({items:[{id:roomId,name:'신고 대상 방',minimumTier:'Gold',status:'open',canEnter}]}):Response.json({items:[{id:page.id,body:'대상 방 메시지',profileId:page.id,nickname:'팬',createdAt:'2026-11-03T00:00:00Z'}]}));vi.stubGlobal('fetch',fetcher);
 render(<GroupRoomsPanel pageId={page.id} locale='ko' initialRoomId={roomId}/>);
 if(canEnter){expect(await screen.findByText('대상 방 메시지')).toBeInTheDocument();expect(fetcher.mock.calls.some(([url])=>url.includes(`/rooms/${roomId}/messages`))).toBe(true);}else{await screen.findByText('멤버 전용 콘텐츠를 볼 수 없어요');expect(screen.queryByText('대상 방 메시지')).not.toBeInTheDocument();expect(fetcher.mock.calls).toHaveLength(1);}
});

it.each([['recent','기본순'],['popular','팬 많은 순']])('announces the currently selected directory order %s',async(sort,label)=>{
 window.history.replaceState(null,'',`/pages/groups?sort=${sort}`);vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[page],nextCursor:null})));render(<GroupDirectory locale='ko'/>);expect(await screen.findByRole('button',{name:label})).toBeVisible();expect(screen.queryByRole('button',{name:sort==='popular'?'기본순':'팬 많은 순'})).toBeNull();
});
it.each([undefined,false,true])('shows room management only when server grants canManage=%s',async canManage=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[],...(canManage===undefined?{}:{canManage})})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko'/>);
 await screen.findByText('아직 표시할 페이지가 없어요.');
 const link=screen.queryByRole('link',{name:'비밀방 개설'});
 if(canManage)expect(link).toHaveAttribute('href',`/pages/groups/${page.id}/manage?locale=ko&section=rooms`);else expect(link).toBeNull();
});

it('shows membership rather than fan certification for a free room',async()=>{
 const roomId='20000000-0000-4000-8000-000000000012';
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('/rooms')?{items:[{id:roomId,name:'자유방',defaultKey:'free',minimumTier:null,status:'open',canEnter:true}]}:{items:[]})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);
 await screen.findByRole('button',{name:/자유방/});
 expect(screen.queryByText(/팬 인증 완료/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/자유방/}));
 await screen.findByRole('heading',{name:'자유방'});
 expect(screen.queryByText(/팬 인증 완료/)).not.toBeInTheDocument();
});

it('keeps free and certified room conditions distinct and does not direct locked free rooms to certification',async()=>{
 const freeId='20000000-0000-4000-8000-000000000012', certifiedId='20000000-0000-4000-8000-000000000013';
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id:freeId,name:'자유방',defaultKey:'free',minimumTier:null,status:'open',canEnter:false},{id:certifiedId,name:'인증방',defaultKey:'certified',minimumTier:'Bronze',status:'open',canEnter:false}]})));
 render(<GroupRoomsPanel pageId={page.id} locale='ko' slug='nchive'/>);
 await screen.findByRole('button',{name:/자유방/});
 expect(screen.getByText(/자유방:.*인증방: 팬 인증 완료 · Bronze 이상/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/자유방/}));
 expect(screen.queryByRole('link',{name:'팬 인증'})).not.toBeInTheDocument();
});

it('shows the identity skeleton only while the first request is pending and retains error retry',async()=>{
 const waiting:((r:Response)=>void)[]=[];const finish=(r:Response)=>{for(const resolve of waiting.splice(0))resolve(r.clone());};
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{waiting.push(resolve);})));
 render(<GroupDetailScreen pageId={page.id} locale='ko'/>);
 expect(await screen.findByRole('status')).toBeInTheDocument();
 expect(document.querySelector('[data-fan-page-header="loading"]')).toHaveAttribute('aria-busy','true');
 await act(async()=>finish(Response.json({error:{code:'UNAVAILABLE'}},{status:503})));
 expect(await screen.findByRole('alert')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'다시 시도'})).toBeInTheDocument();
 expect(screen.queryByRole('status')).toBeNull();
});
