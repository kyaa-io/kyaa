import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const deps=vi.hoisted(()=>({rpc:vi.fn(),authorize:vi.fn()}));
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:()=>deps}));
import {GET,POST} from './route';
beforeEach(()=>{vi.clearAllMocks();deps.authorize.mockResolvedValue({appUserId:'owner'});deps.rpc.mockResolvedValue(true);});
it('reads and idempotently marks only the authenticated owner round',async()=>{
 const url='https://x/api/me/page-notices?key=raffle-results:elina:1';
 expect((await GET(new Request(url))).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith('page_notice_seen',{p_app_user_id:'owner',p_key:'raffle-results:elina:1',p_mark:false});
 expect((await POST(new Request(url,{method:'POST'}))).status).toBe(200);
 expect(deps.rpc).toHaveBeenLastCalledWith('page_notice_seen',expect.objectContaining({p_mark:true}));
});
