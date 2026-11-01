import { expect,it } from 'vitest';
import { contentFixture } from './content-fixtures';
import { groupPostsSchema,groupRoomsSchema } from '../../features/groups/domain/contracts';
const base='http://localhost/api/groups/e9200000-0000-4000-8000-000000000001';
it.each(['scheduled','readonly','denied','closed'])('returns contract-valid %s room state',async state=>{
 const data=groupRoomsSchema.parse(await contentFixture(new URL(base+'/rooms'),'GET',null,state)!.json());expect(data.items[0].status).toBe(state==='denied'?'open':state);expect(data.items[0].canEnter).toBe(!['denied','closed'].includes(state));
});
it('preserves the nested reply and persists submitted text only in the local fixture',async()=>{
 const posts=groupPostsSchema.parse(await contentFixture(new URL(base+'/posts'),'GET',null,null)!.json()),url=new URL(base+'/posts/'+posts.items[0].id+'/comments');
 const before=await contentFixture(url,'GET',null,null)!.json();expect(before.items[1].parentId).toBe(before.items[0].id);
 await contentFixture(url,'POST',{body:'로컬 검증 답글',parentId:before.items[0].id},null)!.json();const after=await contentFixture(url,'GET',null,null)!.json();expect(after.items.at(-1)).toMatchObject({body:'로컬 검증 답글',parentId:before.items[0].id});expect(after.items[1].assets).toHaveLength(1);
});
