import type {ReactNode} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {APP_LOCALES} from '@/i18n/locales';
import {groupEarningAmount,groupEarningTitle,groupEarningsCopy} from './group-earnings-copy';
import {groupEarningEntrySchema} from '../domain/earnings';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupEarningsScreen} from './group-earnings-screen';
const auth=vi.hoisted(()=>({ready:true,authenticated:true,user:{id:'owner-a'},generation:1,getAccessToken:vi.fn(async()=> 'local-test-token')}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>auth}));
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:auth.ready,ownerId:auth.user.id,generation:auth.generation})}));
vi.mock('./group-shell',()=>({GroupShell:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock('./group-activity-header',()=>({GroupActivityHeader:()=>null}));
export const pageId='10000000-0000-4000-8000-000000000001';
export const entry={entryKey:`activity:${pageId}`,kind:'activity',activityKey:'unmapped-key',title:'원문 활동',status:'credited',asset:'fan_point',originalAmount:37,correctionAmount:null,netAmount:37,reason:null,occurredAt:'2026-11-01T00:00:00Z',processedAt:null,activityHref:null};
beforeEach(()=>{auth.ready=true;auth.authenticated=true;auth.user={id:'owner-a'};auth.generation=1;vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('/earnings')?{entries:[entry],nextCursor:'opaque+/='}:{error:{code:'NOT_FOUND'}}),{status:url.includes('/earnings')?200:404,headers:{'Content-Type':'application/json'}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses the actual owner API and displays a verified amount without invented activity titles',async()=>{
 render(<GroupEarningsScreen pageId={pageId} locale='ko' cursor='opaque+/='/ >);
 expect(await screen.findByText('원문 활동')).toBeInTheDocument();
 expect(screen.getByText('+37P')).toBeInTheDocument();
 await waitFor(()=>expect(fetch).toHaveBeenCalledWith(`/api/groups/${pageId}/earnings?limit=30&cursor=opaque%2B%2F%3D`,expect.anything()));
 expect(screen.getByRole('link',{name:'더 보기'})).toHaveAttribute('href',`/pages/groups/${pageId}/earnings?locale=ko&cursor=opaque%2B%2F%3D`);
});
it.each(['pending','rejected','no_reward','correction_review','corrected','entered','refunded'] as const)('does not invent an amount for %s',status=>{
 const value=groupEarningEntrySchema.parse({...entry,status,netAmount:null});
 expect(groupEarningAmount(value,'ko')).toBeNull();
});
it.each(APP_LOCALES)('has complete copy and noninvented title fallback in %s',locale=>{
 const c=groupEarningsCopy(locale);expect(Object.values(c.statuses)).toHaveLength(8);expect(Object.values(c.statuses).every(Boolean)).toBe(true);
 expect(groupEarningTitle(groupEarningEntrySchema.parse({...entry,title:null}),locale)).toBe(c.kinds.activity);
 expect(groupEarningTitle(groupEarningEntrySchema.parse({...entry,title:'  원문\n제목  '}),locale)).toBe('  원문\n제목  ');
 expect(groupEarningAmount(groupEarningEntrySchema.parse({...entry,netAmount:null}),locale)).toBeNull();
 expect(groupEarningAmount(groupEarningEntrySchema.parse({...entry,asset:'ticket'}),locale)).toContain(c.tickets);
});
it('preserves result links and omits fictional amounts for pending/corrected records',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({entries:[{...entry,status:'corrected',netAmount:0}],nextCursor:null})));
 render(<GroupEarningsScreen pageId={pageId} locale='ko' cursor='opaque+/='/ >);
 expect(await screen.findByRole('link',{name:'상세: 원문 활동'})).toHaveAttribute('href',`/pages/groups/${pageId}/earnings/${encodeURIComponent(entry.entryKey)}?locale=ko&cursor=opaque%2B%2F%3D`);
 expect(screen.queryByText(/0P/)).toBeNull();
});
it.each([403,404])('shows unavailable without private server messages (%i)',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'PRIVATE_OWNER_MESSAGE'}},{status})));
 render(<GroupEarningsScreen pageId={pageId} locale='ko'/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('이 내역을 확인할 수 없어요.');
 expect(screen.queryByText('PRIVATE_OWNER_MESSAGE')).toBeNull();
});
it('shows one recoverable error and retries the same cursor',async()=>{
 let calls=0;vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/earnings')?(++calls===1?Response.json({}, {status:503}):Response.json({entries:[],nextCursor:null})):Response.json({}, {status:404})));
 render(<GroupEarningsScreen pageId={pageId} locale='ko' cursor='opaque+/='/ >);
 expect(await screen.findByRole('alert')).toHaveTextContent('내역을 불러오지 못했어요.');
 expect(screen.queryByText('아직 적립 내역이 없어요. 모임 덕질에서 참여할 활동을 찾아보세요.')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'다시 불러오기'}));
 expect(await screen.findByText('아직 적립 내역이 없어요. 모임 덕질에서 참여할 활동을 찾아보세요.')).toBeInTheDocument();
 expect(calls).toBe(2);
});
it('does not turn a malformed response into empty/zero data',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({entries:[{...entry,netAmount:'37'}],nextCursor:null})));
 render(<GroupEarningsScreen pageId={pageId} locale='ko'/>);
 expect(await screen.findByRole('alert')).toBeInTheDocument();expect(screen.queryByText('+37P')).toBeNull();
});
it('keeps restoring and guest state separate and preserves safe login return',async()=>{
 auth.ready=false;const view=render(<GroupEarningsScreen pageId={pageId} locale='ja' cursor='opaque+/='/ >);
 expect(screen.getByRole('status')).toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
 auth.ready=true;auth.authenticated=false;auth.generation++;view.rerender(<GroupEarningsScreen pageId={pageId} locale='ja' cursor='opaque+/='/ >);
 const link=screen.getByRole('link');expect(new URL(link.getAttribute('href')!,'https://kyaa.invalid').searchParams.get('returnTo')).toBe(`/pages/groups/${pageId}/earnings?locale=ja&cursor=opaque%2B%2F%3D`);
 await waitFor(()=>expect(fetch).toHaveBeenCalled());expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/earnings'))).toBe(false);
});
it('removes account A data immediately and ignores its late response after account change',async()=>{
 let resolveA!:(v:Response)=>void;let calls=0;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/earnings')?(++calls===1?new Promise<Response>(resolve=>{resolveA=resolve;}):Response.json({entries:[{...entry,title:'계정 B 활동'}],nextCursor:null})):Response.json({}, {status:404})));
 const view=render(<GroupEarningsScreen pageId={pageId} locale='ko'/>);
 await waitFor(()=>expect(calls).toBe(1));
 auth.user={id:'owner-b'};auth.generation++;view.rerender(<GroupEarningsScreen pageId={pageId} locale='ko'/>);
 expect(screen.queryByText('원문 활동')).toBeNull();expect(await screen.findByText('계정 B 활동')).toBeInTheDocument();
 await act(async()=>resolveA(Response.json({entries:[entry],nextCursor:null})));
 expect(screen.queryByText('원문 활동')).toBeNull();expect(screen.getByText('계정 B 활동')).toBeInTheDocument();
 auth.authenticated=false;auth.generation++;view.rerender(<GroupEarningsScreen pageId={pageId} locale='ko'/>);
 expect(screen.queryByText('계정 B 활동')).toBeNull();
});
