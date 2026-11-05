import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PopularPosts} from './popular-posts';
const resource=vi.hoisted(()=>vi.fn());
vi.mock('@/features/fanpage/ui/use-community-resource',()=>({useCommunityResource:resource}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
describe('popular posts',()=>{
 const post=(n:number,extra:Record<string,unknown>={})=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,celebritySlug:'artist',body:`이야기 ${n}\n본문`,visibility:'public',revision:1,author:{nickname:`팬${n}`,avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt:'2026-11-05T01:00:00.000Z',updatedAt:'2026-11-05T01:00:00.000Z',isOwner:false,likeCount:n,liked:false,commentCount:0,viewCount:n*1000,...extra});
 it('lists up to ten posts in the board row with views and likes, and requests the selected period',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:Array.from({length:10},(_,i)=>post(i+1,i===0?{commentCount:3,viewCount:1234567}:{}))}}});
  const {container}=render(<PopularPosts slug='artist' locale='ko'/>);
  expect(container.querySelectorAll('li')).toHaveLength(10);
  const first=container.querySelectorAll('a')[0] as HTMLElement;expect(first).toHaveTextContent('이야기 1 (3)');
  expect(first).toHaveAttribute('href','/c/artist/community/00000000-0000-4000-8000-000000000001?locale=ko&returnTo=%2Fartist%3Ftab%3Dboard%26locale%3Dko%23celebrity-content');
  expect(first).toHaveTextContent('(3)');expect(first).toHaveTextContent('1234567');expect(first.querySelectorAll(':scope > span, :scope > time')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button',{name:'주간'}));
  expect(resource).toHaveBeenLastCalledWith('/api/celebrities/artist/popular-posts?period=week&locale=ko',expect.any(Function),false);
  const parse=resource.mock.calls[0]![1] as (value:unknown)=>{items:unknown[]};
  expect(parse({items:[post(1)]}).items).toHaveLength(1);expect(()=>parse({items:Array.from({length:11},(_,i)=>post(i+1))})).toThrow();
 });
 it('shows the selected language in the empty state and period controls',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[]}}});
  render(<PopularPosts slug='artist' locale='ja'/>);
  expect(screen.getByRole('heading',{name:'人気の投稿'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'週間'})).toBeInTheDocument();
  expect(screen.getByText('人気の投稿はまだありません。')).toBeInTheDocument();
 });
});
