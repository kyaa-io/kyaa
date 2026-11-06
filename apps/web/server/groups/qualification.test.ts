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
const second='e9200000-0000-4000-8000-000000000003';
function experienceHandler(){const rpc=vi.fn().mockResolvedValue({id,status:'submitted',pageId:null}),handle=createGroupHandler({rpc,authorize:async()=>({appUserId:actor}),authorizeAdmin:vi.fn()});return{rpc,call:(qualification:unknown)=>handle('apply',new Request('https://dev.kyaa.io/api',{method:'POST',body:JSON.stringify({kind:'fan',name:'아이유',description:'소개',requestId:id,qualification})}))};}
it('accepts the operating experience answers without a community name',async()=>{
 const s=experienceHandler();
 for(const qualification of [{hasExistingPage:false},{hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[id]},{hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[id,second]}]){expect((await s.call(qualification)).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith('groups_dispatch',expect.objectContaining({p_actor:actor,p_input:expect.objectContaining({qualification})}));}
});
it('refuses an operating experience answer the server cannot review',async()=>{
 const s=experienceHandler();
 for(const qualification of [
  {hasExistingPage:true},
  {hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[]},
  {hasExistingPage:true,assetIds:[id]},
  {hasExistingPage:true,evidenceUrl:'http://cafe.naver.com/club',assetIds:[id]},
  {hasExistingPage:true,evidenceUrl:'javascript:alert(1)',assetIds:[id]},
  {hasExistingPage:true,evidenceUrl:'https://user:secret@cafe.naver.com',assetIds:[id]},
  {hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[id,id]},
  {hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[id,second,actor,'e9200000-0000-4000-8000-000000000004']},
  {hasExistingPage:true,evidenceUrl:'https://cafe.naver.com/club',assetIds:[id],communityName:'이름'},
  {hasExistingPage:false,evidenceUrl:'https://cafe.naver.com/club'},
  {hasExistingPage:false,assetIds:[id]},
  {hasExistingPage:'yes'},
 ])expect((await s.call(qualification)).status,JSON.stringify(qualification)).toBe(400);
 expect(s.rpc).not.toHaveBeenCalled();
});
