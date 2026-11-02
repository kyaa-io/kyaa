import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {createGroupHandler} from './routes';
const actor='e9200000-0000-4000-8000-000000000001',id='e9200000-0000-4000-8000-000000000002';
it('validates private qualification inputs and retains revision in server-authenticated requests',async()=>{
 const rpc=vi.fn().mockResolvedValue({id,status:'submitted',pageId:null}),handle=createGroupHandler({rpc,authorize:async()=>({appUserId:actor}),authorizeAdmin:vi.fn()});
 const input={kind:'hobby',name:'Club',description:'Introduction',requestId:id,expectedRevision:2,qualification:{communityName:'Club',evidenceUrl:'https://example.test/club',introduction:'Experience',assetIds:[id]}};
 const call=(value:unknown)=>handle('revise',new Request('https://dev.kyaa.io/api',{method:'PATCH',body:JSON.stringify(value)}),{itemId:id});
 expect((await call(input)).status).toBe(200);expect(rpc).toHaveBeenCalledWith('groups_dispatch',expect.objectContaining({p_actor:actor,p_input:input}));
 for(const qualification of [{...input.qualification,evidenceUrl:'http://example.test'},{...input.qualification,evidenceUrl:'https://user:secret@example.test'},{...input.qualification,assetIds:[id,id]},{...input.qualification,actorId:actor}])expect((await call({...input,qualification})).status).toBe(400);
 expect(rpc).toHaveBeenCalledTimes(1);
});
