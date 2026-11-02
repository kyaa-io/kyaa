import {expect,it} from 'vitest';
import {contentFixture} from './content-fixtures';
it('filters and sorts the local group board like its API',async()=>{
 const read=async(query:string)=>(await contentFixture(new URL(`http://localhost/api/groups/test/posts?${query}`),'GET',null,null)!.json()).items;
 expect((await read('category=notice')).map((item:{category:string})=>item.category)).toEqual(['notice']);
 expect((await read('category=free&search=함께 달릴')).map((item:{title:string})=>item.title)).toEqual(['주말 함께 달릴 분 계신가요?']);
 expect((await read('category=free&sort=popular'))[0].title).toBe('주말 함께 달릴 분 계신가요?');
});
it('keeps local post edits within the selected page',async()=>{
 const base='http://localhost/api/groups/fixture-write/posts';
 const call=async(path:string,method='GET',body:Record<string,unknown>|null=null)=>contentFixture(new URL(base+path),method,body,null)!.json();
 const created=await call('','POST',{title:'새 이야기',body:'함께해요',category:'free',visibility:'public'});
 expect((await call(`/${created.id}`)).title).toBe('새 이야기');
 await call(`/${created.id}`,'PATCH',{title:'수정한 이야기'});
 expect((await call('?search=수정한')).items[0].id).toBe(created.id);
 await call(`/${created.id}`,'DELETE');
 expect((await call('?search=수정한')).items).toHaveLength(0);
});

it('pages the source home fixtures using the requested page size',async()=>{const read=async(q:string)=>contentFixture(new URL('http://localhost/api/groups/fixture-paging/posts?'+q),'GET',null,null)!.json();const first=await read('limit=5');expect(first.items).toHaveLength(5);expect(first.nextCursor).toBe('5');const next=await read('limit=5&cursor=5');expect(next.items[0].id).not.toBe(first.items[0].id);expect((await read('limit=20')).items).toHaveLength(20);});
