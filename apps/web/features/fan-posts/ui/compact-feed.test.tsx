import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CompactFeed} from './compact-feed';
import {feedPageSchema} from '../domain/feed';
import {legacyVisualFixture} from '../../../e2e/groups-local/legacy-visual-fixtures';
vi.mock('../../content-safety/ui/content-asset',()=>({ContentAssetImage:(props:{asset:{id:string};thumbnail?:boolean;loading?:string})=> <img data-testid='thumb-img' data-id={props.asset.id} data-thumbnail={String(!!props.thumbnail)} data-loading={props.loading} alt=''/>}));
vi.mock('./feed-item-card',()=>({FeedItemCard:()=> <div>응원 글 상세</div>}));
it('keeps notice links and links the original cheer ID to detail',async()=>{
 const response=legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!;
 const {items}=feedPageSchema.parse(await response.json());
 const {container}=render(<CompactFeed items={items} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 expect(screen.getByRole('link',{name:/처음 오셨다면/})).toHaveAttribute('href',expect.stringContaining('/c/elina/notices/fixture-welcome'));
 const link=screen.getByRole('link',{name:/오늘 같이 본 영상 이야기해요/});
 expect(link).toHaveAttribute('href','/c/elina/community/e9600000-0000-4000-8000-000000000002?source=cheer&locale=ko&returnTo=%2Felina%3Ftab%3Dboard');
 expect(container.querySelectorAll('li')[0]?.querySelectorAll(':scope > a > span, :scope > a > time')).toHaveLength(5);expect(container.textContent).toContain('조회');
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

it('shows a thumbnail, video mark or placeholder before each title and bolds notices',async()=>{
 const response=legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!;
 const {items}=feedPageSchema.parse(await response.json());
 const posts=items.filter(item=>item.kind==='cheer').slice(0,3).map(item=>({...item,kind:'fan_post',body:item.body||'제목',commentCount:0,likeCount:0,author:{nickname:'팬'},createdAt:'2026-11-05T00:00:00Z'})) as any[];
 const notice=items.find(item=>item.kind==='notice')!;
 const shaped=[notice,{...posts[0],assets:[{id:'asset-1',width:300,height:200}],video:null},{...posts[1],assets:[],video:{}},{...posts[2],assets:[],video:null}];
 const {container}=render(<CompactFeed items={shaped as never} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 const marks=[...container.querySelectorAll('[data-thumb]')].map(node=>node.getAttribute('data-thumb'));
 expect(marks).toEqual(expect.arrayContaining(['photo','none']));
 const img=screen.getAllByTestId('thumb-img');
 expect(img).toHaveLength(1);expect(img[0]).toHaveAttribute('data-id','asset-1');expect(img[0]).toHaveAttribute('data-thumbnail','true');expect(img[0]).toHaveAttribute('data-loading','lazy');
 for(const node of container.querySelectorAll('[data-thumb="none"]'))expect(node).toHaveAttribute('aria-hidden','true');
 expect(container.textContent).not.toMatch(/사진 없음|No photo/);
 expect(notice.kind).toBe('notice');expect(container.querySelector('li:has([data-thumb])')).not.toBeNull();expect(screen.getByRole('link',{name:/처음 오셨다면/}).closest('li')?.className).toMatch(/notice/);
});
