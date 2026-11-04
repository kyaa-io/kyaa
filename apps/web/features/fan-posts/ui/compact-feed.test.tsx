import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CompactFeed} from './compact-feed';
import {feedPageSchema} from '../domain/feed';
import {legacyVisualFixture} from '../../../e2e/groups-local/legacy-visual-fixtures';
vi.mock('./feed-item-card',()=>({FeedItemCard:()=> <div>응원 글 상세</div>}));
it('keeps notice links and links the original cheer ID to detail',async()=>{
 const response=legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!;
 const {items}=feedPageSchema.parse(await response.json());
 const {container}=render(<CompactFeed items={items} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 expect(screen.getByRole('link',{name:/처음 오셨다면/})).toHaveAttribute('href',expect.stringContaining('/c/elina/notices/fixture-welcome'));
 const link=screen.getByRole('link',{name:/오늘 같이 본 영상 이야기해요/});
 expect(link).toHaveAttribute('href','/c/elina/community/e9600000-0000-4000-8000-000000000002?source=cheer&locale=ko&returnTo=%2Felina%3Ftab%3Dboard');
 expect(container.querySelectorAll('li')[0]?.querySelectorAll(':scope > a > span, :scope > a > time')).toHaveLength(4);expect(container.textContent).not.toContain('조회수');
 expect(link).toHaveTextContent('(3)');expect(link.querySelector('.lucide-chevron-down')).toBeNull();expect(container.querySelector('details')).toBeNull();
});

it('keeps fixture detail and replies attached to the original cheer IDs on both pages',async()=>{
 for(const cursor of ['', '?cursor=fixture-next']){
  const feed=await legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'+cursor),'GET','ko','creator')!.json();
  for(const item of feed.items.filter((item:any)=>item.kind==='cheer')){
   const detail=await legacyVisualFixture(new URL('http://localhost/api/cheers/'+item.id),'GET','ko','creator-post')!.json();
   expect(detail).toEqual({source:'cheer',id:item.id,celebritySlug:'elina',body:item.body});
   const replies=await legacyVisualFixture(new URL('http://localhost/api/cheers/'+item.id+'/replies'),'GET','ko','creator-post')!.json();expect(replies.replies).toHaveLength(item.replyCount);
  }
 }
});
