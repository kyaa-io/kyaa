import {describe,it,expect} from 'vitest';
import {membersFixture} from './members-fixtures';
import {groupPeopleSchema} from '../../server/group-members/domain';
describe('source member fixture boundary',()=>{
 it('uses source ranks and scores only when explicitly selected',()=>{const url=new URL('http://local/api/groups/example/people?mode=ranking');const source=groupPeopleSchema.parse(membersFixture(url,null,true));expect(source.items.map(row=>[row.nickname,row.rank,row.points])).toEqual([['별빛',1,2480],['하늘',2,2160],['보라',3,1920]]);expect(groupPeopleSchema.parse(membersFixture(url,null)).items[1].rank).toBe(3);});
 it('paginates source examples without replacing its first page',()=>{const url=new URL('http://local/api/groups/example/people?mode=members');const first=groupPeopleSchema.parse(membersFixture(url,null,true));expect(first.items.map(row=>row.nickname)).toEqual(['별빛','하늘','보라','은하']);url.searchParams.set('cursor',first.nextCursor!);const second=groupPeopleSchema.parse(membersFixture(url,null,true));expect(second.items.map(row=>row.nickname)).toEqual(['달빛','구름','함께하는 팬']);expect(second.nextCursor).toBeNull();});
 it('filters source friends and searches without changing the production schema',()=>{const url=new URL('http://local/api/groups/example/people?mode=friends&search=보라');expect(groupPeopleSchema.parse(membersFixture(url,null,true)).items.map(row=>row.nickname)).toEqual(['보라']);});
});
