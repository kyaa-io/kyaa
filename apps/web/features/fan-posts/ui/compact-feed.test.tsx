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
 expect(container.querySelector('[data-fan-post-row]')).not.toBeNull();
 const row=link.closest('[data-fan-post-row]')!;expect(row.querySelector('[aria-label="댓글 3"]')).toHaveTextContent('3');expect(row.querySelector('.lucide-chevron-down')).toBeNull();expect(container.querySelector('details')).toBeNull();
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

it('draws a public post photo, a post icon for the rest, never a broken-image mark, and marks notices',async()=>{
 const response=legacyVisualFixture(new URL('http://localhost/api/celebrities/elina/feed'),'GET','ko','creator')!;
 const {items}=feedPageSchema.parse(await response.json());
 const posts=items.filter(item=>item.kind==='cheer').slice(0,4).map(item=>({...item,kind:'fan_post',body:item.body||'제목',visibility:'public',commentCount:0,likeCount:0,author:{nickname:'팬'},createdAt:'2026-11-05T00:00:00Z'})) as any[];
 const notice=items.find(item=>item.kind==='notice')!;
 const shaped=[notice,{...posts[0],assets:[{id:'asset-1',width:300,height:200}],video:null},{...posts[1],assets:[{id:'asset-2',width:300,height:200}],visibility:'members',video:null},{...posts[2],assets:[],video:{}},{...posts[3],assets:[],video:null}];
 const {container}=render(<CompactFeed items={shaped as never} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 const images=[...container.querySelectorAll('img')].map(node=>node.getAttribute('src'));
 expect(images).toEqual(['/api/content-assets/asset-1?size=thumbnail']);
 expect(container.querySelector('.lucide-image-off')).toBeNull();
 expect(container.querySelectorAll('.lucide-file-text').length).toBe(4);
 expect(container.textContent).not.toMatch(/사진 없음|No photo/);
 const row=screen.getByRole('link',{name:/처음 오셨다면/}).closest('[data-fan-post-row]')!;
 expect(row).toHaveAttribute('data-notice');expect(row).toHaveTextContent('공지');
});

it('preserves the chronological feed order including notices',()=>{
 const base={visibility:'public',revision:1,likeCount:0,liked:false};
 const items=feedPageSchema.parse({items:[
  {kind:'fan_post',id:'10000000-0000-4000-8000-000000000001',celebritySlug:'elina',body:'최신 팬 글',author:{nickname:'팬',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],video:null,createdAt:'2026-11-07T01:00:00Z',updatedAt:'2026-11-07T01:00:00Z',isOwner:false,commentCount:0,...base},
  {kind:'notice',noticeKind:'standard',id:'10000000-0000-4000-8000-000000000002',slug:'old-notice',title:'오래된 공지',postType:'notice',visibility:'public',revision:1,publishedAt:'2026-10-01T00:00:00Z',body:{},commentCount:0,likeCount:0,liked:false,pinned:false},
  {kind:'fan_post',id:'10000000-0000-4000-8000-000000000003',celebritySlug:'elina',body:'이전 팬 글',author:{nickname:'팬',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],video:null,createdAt:'2026-11-06T01:00:00Z',updatedAt:'2026-11-06T01:00:00Z',isOwner:false,commentCount:0,...base},
 ],nextCursor:null}).items;
 const {container}=render(<CompactFeed items={items} slug='elina' locale='ko' returnTo='/elina?tab=board' onChanged={()=>{}}/>);
 const titles=[...container.querySelectorAll('[data-fan-post-row]')].map(row=>row.textContent);
 expect(titles[0]).toContain('최신 팬 글');expect(titles[1]).toContain('오래된 공지');expect(titles[2]).toContain('이전 팬 글');
});
