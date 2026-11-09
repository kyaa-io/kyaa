// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {groupPostsSchema} from '../domain/contracts';
import {GroupPostArticle,type GroupPostView} from './group-post-article';

vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:vi.fn()})}));
afterEach(cleanup);

const base:GroupPostView={id:'10000000-0000-4000-8000-000000000001',title:'제목',body:'본문',nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z',visibility:'public',likeCount:0,commentCount:0};
const show=(post:GroupPostView,locale:'ko'|'ja'='ko')=>render(<GroupPostArticle pageId='20000000-0000-4000-8000-000000000001' post={post} locale={locale} member authenticated busy={false} onReact={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onReport={vi.fn()}/>);

it('marks the post header beside the written time when the server sends an edit time',()=>{
 const {container}=show({...base,editedAt:'2026-11-02T00:00:00Z'});
 const mark=container.querySelector('[data-post-detail-header] [data-edited-mark]');
 expect(mark).toHaveTextContent('수정됨');
 expect(mark?.parentElement).toContainElement(container.querySelector('[data-post-detail-header] time') as HTMLElement);
});
it('keeps the operator badge alongside the edited mark',()=>{
 const {container,getByText}=show({...base,operator:true,editedAt:'2026-11-02T00:00:00Z'});
 expect(getByText('운영자')).toHaveAttribute('data-fan-tag','neutral');
 expect(container.querySelector('[data-edited-mark]')).toHaveTextContent('수정됨');
});
it('translates the mark and shows nothing for a never-edited or older response',()=>{
 expect(show({...base,editedAt:'2026-11-02T00:00:00Z'},'ja').container.querySelector('[data-edited-mark]')).toHaveTextContent('編集済み');
 cleanup();
 expect(show({...base,editedAt:null}).container.querySelector('[data-edited-mark]')).toBeNull();
 cleanup();
 expect(show(base).container.querySelector('[data-edited-mark]')).toBeNull();
});
it('keeps editedAt through the post contract and accepts a response without it',()=>{
 const row={id:base.id,pageId:'20000000-0000-4000-8000-000000000001',title:'t',body:'b',visibility:'public',anonymous:false,profileId:null,nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'};
 const parsed=groupPostsSchema.parse({items:[{...row,operator:true,editedAt:'2026-11-02T00:00:00Z'},{...row,editedAt:null},row],nextCursor:null});
 expect(parsed.items.map(item=>item.editedAt)).toEqual(['2026-11-02T00:00:00Z',null,undefined]);
 expect(parsed.items[0].operator).toBe(true);
});
