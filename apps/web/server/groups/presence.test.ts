import {expect,it,vi} from 'vitest';
import {AuthError} from '@/features/auth/domain/auth-errors';
import {createGroupHandler} from './routes';
vi.mock('server-only',()=>({}));
const id='10000000-0000-4000-8000-000000000001';
function setup(){
 const rpc=vi.fn(async()=>({onlineCount:0,todayCount:0,artists:[]}));
 const authorize=vi.fn(async(token:string|null)=>{if(token!=='Bearer valid')throw new AuthError('AUTHENTICATION_REQUIRED',401,'Login');return {appUserId:id};});
 return {rpc,authorize,handle:createGroupHandler({rpc,authorize,authorizeAdmin:vi.fn()})};
}
it('allows anonymous no-store reads but rejects unauthenticated and forged heartbeats',async()=>{
 const s=setup();const read=await s.handle('presence',new Request('https://kyaa.test/api'),{id});
 expect(read.status).toBe(200);expect(read.headers.get('cache-control')).toBe('private, no-store');expect(s.authorize).not.toHaveBeenCalled();
 for(const token of [null,'Bearer forged'])expect((await s.handle('heartbeat',new Request('https://kyaa.test/api',{method:'PUT',headers:token?{authorization:token}:{}}),{id})).status).toBe(401);
 expect(s.rpc).toHaveBeenCalledTimes(1);
});
it('takes heartbeat actor exclusively from authentication and validates page IDs',async()=>{
 const s=setup();const request=()=>new Request('https://kyaa.test/api?actor=attacker',{method:'PUT',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({p_actor:'attacker',online:true})});
 expect((await s.handle('heartbeat',request(),{id})).status).toBe(200);
 expect(s.rpc).toHaveBeenCalledWith('groups_content_dispatch',{p_operation:'heartbeat',p_actor:id,p_page_id:id,p_item_id:null,p_input:{},p_admin_id:null});
 expect((await s.handle('heartbeat',request(),{id:'invalid'})).status).toBe(400);expect(s.rpc).toHaveBeenCalledTimes(1);
});
it('does not synthesize counts on DB failure or override database membership denial',async()=>{
 const s=setup();s.rpc.mockRejectedValueOnce(Error('GROUPS_FORBIDDEN'));
 expect((await s.handle('heartbeat',new Request('https://kyaa.test/api',{method:'PUT',headers:{authorization:'Bearer valid'}}),{id})).status).toBe(403);
 s.rpc.mockRejectedValueOnce(Error('DB_UNAVAILABLE'));const response=await s.handle('presence',new Request('https://kyaa.test/api'),{id});expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('onlineCount');
});

it('accepts explicit notification consent separately from display sharing',async()=>{
 const s=setup();
 const request=(body:unknown)=>new Request('https://kyaa.test/api',{method:'PUT',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify(body)});
 expect((await s.handle('set-presence-setting',request({notifyEnabled:true}),{})).status).toBe(200);
 expect(s.rpc).toHaveBeenCalledWith('groups_content_dispatch',expect.objectContaining({p_actor:id,p_input:{notifyEnabled:true}}));
 expect((await s.handle('set-presence-setting',request({}),{})).status).toBe(400);
 expect((await s.handle('set-presence-setting',request({notifyEnabled:'true'}),{})).status).toBe(400);
});
