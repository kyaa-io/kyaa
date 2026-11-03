import {describe,expect,it} from 'vitest';
import {membersFixture} from './members-fixtures';
import {groupMembersSchema} from '@/features/groups/domain/contracts';
const url=(search='')=>new URL(`https://fixture.test/api/groups/e9700000-0000-4000-8000-000000000001/members${search}`);
describe('member management fixtures',()=>{
 it('provides source member profiles with valid details instead of page records',()=>{
  const result=groupMembersSchema.parse(membersFixture(url(),null));
  expect(result.items.map(item=>item.nickname)).toEqual(['별빛','하늘','보라','은하']);
  expect(result.items[1]).toMatchObject({tier:'Gold',postCount:12,commentCount:36,answer:'무대 이야기를 나누고 싶어요'});
 });
 it('supports search and the empty state',()=>{
  expect(groupMembersSchema.parse(membersFixture(url('?search=하늘'),null)).items).toHaveLength(1);
  expect(groupMembersSchema.parse(membersFixture(url(),'empty')).items).toEqual([]);
  expect(membersFixture(new URL('https://fixture.test/api/groups/example'),null)).toBeUndefined();
 });
});
