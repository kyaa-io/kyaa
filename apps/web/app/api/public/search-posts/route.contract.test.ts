import { beforeEach, expect, it, vi } from 'vitest';
const actor='10000000-0000-4000-8000-000000000001';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/server/fanpage/dependencies',()=>({createFanpageDependencies:()=>({rpc,authorize:async()=>({appUserId:actor})})}));
import { GET } from './route';
beforeEach(()=>rpc.mockReset());
it('passes the signed-in viewer to the filtered search and returns bounded rows',async()=>{
 rpc.mockResolvedValue({items:[{source:'fan',id:'10000000-0000-4000-8000-000000000002',pageRef:'artist',pageName:'Artist',title:'A post',createdAt:'2026-11-13T00:00:00Z',nickname:'Fan',noticeSlug:null}],hasMore:false});
 const response=await GET(new Request('https://kyaa.invalid/api/public/search-posts?q=post&locale=ja',{headers:{authorization:'Bearer token'}}));
 expect(response.status).toBe(200);expect(rpc).toHaveBeenCalledWith('search_public_posts',{p_actor:actor,p_query:'post',p_locale:'en'});
 expect((await response.json()).items).toHaveLength(1);
});
it.each(['?q=x','?q=foo&q=bar','?q=foo&locale=bad'])('rejects invalid input before querying: %s',async query=>{
 expect((await GET(new Request(`https://kyaa.invalid/api/public/search-posts${query}`))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
