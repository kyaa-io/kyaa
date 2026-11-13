// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {GroupPostArticle,type GroupPostView} from './group-post-article';

vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:vi.fn()})}));
vi.mock('./group-post-comments',()=>({GroupPostComments:()=>null}));
vi.mock('./group-post-asset',()=>({GroupPostAsset:({asset}:{asset:{id:string}})=><img data-media={asset.id} src={`/media/${asset.id}.webp`} alt=''/>}));
afterEach(cleanup);

const assetId='30000000-0000-4000-8000-000000000001';
// Every read of the post hands over new objects, like the real API after a like.
const read=(likeCount:number):GroupPostView=>({id:'10000000-0000-4000-8000-000000000001',title:'제목',body:'본문',nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z',visibility:'public',likeCount,commentCount:0,
 assets:[{id:assetId,kind:'image',width:960,height:640} as never],
 bodyDoc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'사진 한 장'}]},{type:'attachment',attrs:{assetId,kind:'image'}}]}});
const show=(post:GroupPostView)=><GroupPostArticle pageId='20000000-0000-4000-8000-000000000001' post={post} locale='ko' member authenticated busy={false} onReact={vi.fn(async()=>true)} onEdit={vi.fn()} onDelete={vi.fn()} onReport={vi.fn()}/>;

it('keeps the photo node mounted when the post is read again after a like (CEO 11/13: the like button dropped and came back)',()=>{
 const view=render(show(read(3)));
 const photo=view.container.querySelector('[data-media]');
 expect(photo).not.toBeNull();
 view.rerender(show(read(4)));
 view.rerender(show(read(4)));
 expect(view.container.querySelector('[data-media]')).toBe(photo);
 expect(view.container.querySelectorAll('[data-media]')).toHaveLength(1);
});
