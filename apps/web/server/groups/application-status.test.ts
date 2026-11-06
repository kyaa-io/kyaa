import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {AuthError} from '@/features/auth/domain/auth-errors';
import {createGroupHandler} from './routes';
const me='e9300000-0000-4000-8000-000000000001',item='e9300000-0000-4000-8000-000000000002',page='e9300000-0000-4000-8000-000000000003';
const row={id:item,kind:'fan',name:'아이유',status:'rejected',reason:'공식 계정을 확인하지 못했어요',pageId:null,pageSlug:null,submissionRevision:1,submittedAt:'2026-11-07T00:00:00+00:00',reviewedAt:'2026-11-07T01:00:00+00:00'};
function setup(result:unknown={items:[row]}){const rpc=vi.fn().mockResolvedValue(result),authorize=vi.fn(async(auth:string|null)=>{if(auth!=='Bearer valid')throw new AuthError('AUTHENTICATION_REQUIRED',401,'Login');return{appUserId:me};}),authorizeAdmin=vi.fn();return{rpc,handler:createGroupHandler({rpc,authorize,authorizeAdmin})};}
const req=(path:string,auth:string|null='Bearer valid')=>new Request(`https://kyaa.test${path}`,{headers:auth?{authorization:auth}:{}});
describe('my application status',()=>{
 it('requires a login before reading',async()=>{const s=setup();expect((await s.handler('application-status',req('/api/groups/applications/status',null))).status).toBe(401);expect((await s.handler('application-status',req('/api/groups/applications/x',null),{itemId:item})).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();});
 it('reads with the signed-in actor, never a client supplied one',async()=>{const s=setup();const r=await s.handler('application-status',req(`/api/groups/applications/status?actor=${item}&limit=5`));expect(r.status).toBe(200);expect(s.rpc).toHaveBeenCalledWith('group_application_status',{p_actor:me,p_item_id:null,p_limit:5});expect(r.headers.get('cache-control')).toContain('no-store');expect((await r.json()).items[0]).toEqual(row);});
 it('returns one application, with the reason and approved page',async()=>{const approved={...row,status:'approved',reason:null,pageId:page,pageSlug:'iu'};const s=setup({items:[approved]});const r=await s.handler('application-status',req('/api/groups/applications/x'),{itemId:item});expect(r.status).toBe(200);expect(s.rpc).toHaveBeenCalledWith('group_application_status',{p_actor:me,p_item_id:item,p_limit:1});expect(await r.json()).toEqual(approved);});
 it('answers not found for an application the actor does not own',async()=>{const s=setup({items:[]});expect((await s.handler('application-status',req('/api/groups/applications/x'),{itemId:item})).status).toBe(404);});
 it('rejects a malformed id or limit without reading',async()=>{const s=setup();expect((await s.handler('application-status',req('/api/x'),{itemId:'not-a-uuid'})).status).toBe(400);for(const q of ['limit=0','limit=51','limit=1&limit=2'])expect((await s.handler('application-status',req(`/api/x?${q}`))).status).toBe(400);expect(s.rpc).not.toHaveBeenCalled();});
 it('drops any field outside the contract so reviewer data cannot leak',async()=>{const s=setup({items:[{...row,reviewed_by:'admin',applicant_id:me}]});const body=await (await s.handler('application-status',req('/api/x'))).json();expect(body.items[0]).toEqual(row);});
 it('fails closed on a malformed database answer',async()=>{const s=setup({items:[{id:item}]});expect((await s.handler('application-status',req('/api/x'))).status).toBe(503);});
});
