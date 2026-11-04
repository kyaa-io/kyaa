import {act,cleanup,render,renderHook,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AuthError} from '@/features/auth/domain/auth-errors';
import {createGroupHandler} from '@/server/groups/routes';
import {GroupPresence} from './group-presence';
import {useGroupPresence} from './use-group-presence';
vi.mock('server-only',()=>({}));
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'10000000-0000-4000-8000-000000000001'},getAccessToken:vi.fn(async()=> 'token')}));
const session=vi.hoisted(()=>({ready:true,ownerId:'10000000-0000-4000-8000-000000000001',generation:0}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>session}));
const pageId='20000000-0000-4000-8000-000000000001';
let online=true,visible=true,fail=false,deny=false;
let response={onlineCount:7,todayCount:12,artists:[{profileId:'30000000-0000-4000-8000-000000000001',nickname:'Artist',online:true,visitedToday:true}]};
const rpc=vi.fn();
async function flush(){await act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();});}
beforeEach(()=>{
 vi.useFakeTimers();online=true;visible=true;fail=false;deny=false;auth.authenticated=true;auth.ready=true;session.ownerId=auth.user.id;session.generation=0;
 Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>online});
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible?'visible':'hidden'});
 response={onlineCount:7,todayCount:12,artists:[{profileId:'30000000-0000-4000-8000-000000000001',nickname:'Artist',online:true,visitedToday:true}]};
 rpc.mockReset().mockImplementation(async(_name,args)=>{if(fail)throw Error('UNAVAILABLE');if(args.p_operation==='heartbeat'){if(deny)throw Error('GROUPS_FORBIDDEN');return {recorded:true};}return response;});
 const handler=createGroupHandler({rpc,authorize:async(header)=>{if(header!=='Bearer token')throw new AuthError('AUTHENTICATION_REQUIRED',401,'Login');return {appUserId:session.ownerId};},authorizeAdmin:vi.fn()});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>handler(init?.method==='PUT'?'heartbeat':'presence',new Request(`https://kyaa.test${url}`,init),{id:pageId})));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('connects the actual client request and handler; polls both counts and artist state',async()=>{
 render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();
 expect(screen.getByText('7')).toBeVisible();expect(screen.getByText('12')).toBeVisible();expect(screen.getByText('지금 접속 중')).toBeVisible();
 expect(rpc).toHaveBeenCalledWith('groups_content_dispatch',expect.objectContaining({p_operation:'heartbeat',p_actor:session.ownerId,p_page_id:pageId}));
 response={onlineCount:2,todayCount:13,artists:[]};await act(()=>vi.advanceTimersByTimeAsync(30000));await flush();expect(screen.getByText('2')).toBeVisible();expect(screen.queryByText('Artist')).toBeNull();
});
it('removes stale numbers offline and refreshes immediately on reconnect',async()=>{
 render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();
 online=false;act(()=>window.dispatchEvent(new Event('offline')));expect(screen.queryByText('7')).toBeNull();expect(screen.getByRole('status')).toBeVisible();
 const before=rpc.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(60000));expect(rpc).toHaveBeenCalledTimes(before);
 online=true;response={onlineCount:1,todayCount:1,artists:[]};act(()=>window.dispatchEvent(new Event('online')));await flush();expect(screen.getAllByText('1')).toHaveLength(2);
});
it('stops hidden-tab heartbeats, refreshes on return and does not delete another tab on unmount',async()=>{
 const view=render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();
 visible=false;act(()=>document.dispatchEvent(new Event('visibilitychange')));const before=rpc.mock.calls.length;
 await act(()=>vi.advanceTimersByTimeAsync(120000));expect(rpc).toHaveBeenCalledTimes(before);expect(screen.queryByText('7')).toBeNull();
 visible=true;act(()=>document.dispatchEvent(new Event('visibilitychange')));await flush();expect(rpc.mock.calls.length).toBeGreaterThan(before);
 view.unmount();const final=rpc.mock.calls.length;await act(()=>vi.advanceTimersByTimeAsync(120000));expect(rpc).toHaveBeenCalledTimes(final);expect(vi.mocked(fetch).mock.calls.every(([,init])=>init?.method!=='DELETE')).toBe(true);
});
it('public viewers only read; denied heartbeat stops until membership changes',async()=>{
 auth.authenticated=false;const view=render(<GroupPresence pageId={pageId} locale='ko'/>);await flush();expect(rpc.mock.calls.every(([,args])=>args.p_operation==='presence'&&args.p_actor===null)).toBe(true);
 auth.authenticated=true;session.generation++;deny=true;view.rerender(<GroupPresence pageId={pageId} locale='ko'/>);await flush();
 const beats=()=>rpc.mock.calls.filter(([,args])=>args.p_operation==='heartbeat').length;
 expect(beats()).toBe(1);await act(()=>vi.advanceTimersByTimeAsync(30000));await flush();expect(beats()).toBe(1);
 deny=false;view.rerender(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();expect(beats()).toBe(2);
});
it('does not retain successful numbers after read failure or account change',async()=>{
 const view=render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();fail=true;await act(()=>vi.advanceTimersByTimeAsync(30000));await flush();expect(screen.queryByText('7')).toBeNull();expect(screen.getByRole('status')).toHaveTextContent('접속 현황을 불러오지 못했어요.');expect(screen.getByRole('button',{name:'다시 시도'})).toBeTruthy();
 fail=false;session.ownerId='40000000-0000-4000-8000-000000000001';session.generation++;view.rerender(<GroupPresence pageId={pageId} locale='ko' member/>);expect(screen.queryByText('7')).toBeNull();await flush();expect(rpc).toHaveBeenLastCalledWith('groups_content_dispatch',expect.objectContaining({p_actor:session.ownerId}));
});

it('refreshes the read-only sidebar without creating extra heartbeats',async()=>{
 const view=renderHook(()=>useGroupPresence(pageId,false));await flush();expect(view.result.current.data?.onlineCount).toBe(7);
 response={onlineCount:4,todayCount:14,artists:[]};await act(()=>vi.advanceTimersByTimeAsync(30000));await flush();expect(view.result.current.data?.todayCount).toBe(14);expect(rpc.mock.calls.every(([,args])=>args.p_operation==='presence')).toBe(true);
});
it('discards in-flight pre-disconnect responses after reconnect',async()=>{
 auth.authenticated=false;
 let resolveOld!:(value:unknown)=>void;
 rpc.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
 render(<GroupPresence pageId={pageId} locale='ko'/>);await flush();
 online=false;act(()=>window.dispatchEvent(new Event('offline')));
 online=true;response={onlineCount:3,todayCount:15,artists:[]};act(()=>window.dispatchEvent(new Event('online')));await flush();expect(screen.getByText('3')).toBeVisible();
 await act(async()=>resolveOld({onlineCount:999,todayCount:999,artists:[]}));await flush();expect(screen.queryByText('999')).toBeNull();
});
it('does not present malformed API data or auth-pending values as real counts',async()=>{
 auth.ready=false;const view=render(<GroupPresence pageId={pageId} locale='ko'/>);await flush();expect(rpc).not.toHaveBeenCalled();expect(screen.queryByText('0')).toBeNull();
 auth.ready=true;rpc.mockResolvedValue({onlineCount:-1,todayCount:12,artists:[]});view.rerender(<GroupPresence pageId={pageId} locale='ko'/>);await flush();expect(screen.getByRole('status')).toBeVisible();expect(screen.queryByText('-1')).toBeNull();
});

it('retries a transient read once without a second heartbeat',async()=>{
 const handlerFetch=vi.mocked(fetch);let reads=0;const original=handlerFetch.getMockImplementation()!;
 handlerFetch.mockImplementation(async(url,init)=>{if(init?.method!=='PUT'&&reads++===0)return Response.json({error:{code:'TEMPORARY'}},{status:503});return original(url,init);});
 render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();expect(screen.getByText('7')).toBeVisible();expect(reads).toBe(2);expect(handlerFetch.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(1);
});
it('does not retry the unconfigured local transport or show fabricated counts',async()=>{
 const handlerFetch=vi.mocked(fetch);handlerFetch.mockResolvedValue(Response.json({error:{code:'LOCAL_PRESENCE_TRANSPORT_UNAVAILABLE'}},{status:503}));
 render(<GroupPresence pageId={pageId} locale='ko' member/>);await flush();expect(screen.getByRole('status')).toHaveTextContent('접속 현황을 불러오지 못했어요.');expect(screen.getByRole('button',{name:'다시 시도'})).toBeTruthy();expect(screen.queryByText('0')).toBeNull();
 await act(()=>vi.advanceTimersByTimeAsync(120000));act(()=>window.dispatchEvent(new Event('online')));await flush();expect(handlerFetch).toHaveBeenCalledTimes(1);expect(screen.getByRole('status')).toHaveTextContent('접속 현황을 불러오지 못했어요.');
});
it('stops the immediate retry after two failed reads and does not retain counts',async()=>{
 auth.authenticated=false;const handlerFetch=vi.mocked(fetch);handlerFetch.mockResolvedValue(Response.json({error:{code:'TEMPORARY'}},{status:503}));
 render(<GroupPresence pageId={pageId} locale='ko'/>);await flush();expect(handlerFetch).toHaveBeenCalledTimes(2);expect(screen.getByRole('status')).toHaveTextContent('접속 현황을 불러오지 못했어요.');expect(screen.queryByText('0')).toBeNull();expect(screen.queryByText('7')).toBeNull();
});
