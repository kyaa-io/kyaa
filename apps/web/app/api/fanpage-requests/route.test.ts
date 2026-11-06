import {describe,expect,it,vi} from 'vitest';
const participationRoute=vi.hoisted(()=>vi.fn(async()=>Response.json({items:[]})));
vi.mock('@/server/schedules/routes',()=>({participationRoute}));
import {GET,POST} from './route';
import {POST as CHECK} from './check/route';
const post=()=>new Request('https://kyaa.test/api/fanpage-requests',{method:'POST',body:'{}'});
describe('closed favorite request submission',()=>{
 it('refuses new requests and names the path that replaced it',async()=>{for(const handler of [POST,CHECK]){const r=await handler(post());expect(r.status).toBe(410);expect((await r.json()).error).toEqual({code:'FANPAGE_REQUEST_MOVED',path:'/pages/groups/apply?kind=fan'});}expect(participationRoute).not.toHaveBeenCalled();});
 it('keeps earlier requests readable',async()=>{const r=await GET(new Request('https://kyaa.test/api/fanpage-requests'));expect(r.status).toBe(200);expect(participationRoute).toHaveBeenCalledWith('requests',expect.any(Request));});
});
