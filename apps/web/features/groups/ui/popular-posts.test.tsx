import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PopularPosts} from './popular-posts';
const resource=vi.hoisted(()=>vi.fn());
vi.mock('@/features/fanpage/ui/use-community-resource',()=>({useCommunityResource:resource}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
describe('popular posts',()=>{
 const post=(n:number,extra:Record<string,unknown>={})=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,celebritySlug:'artist',body:`이야기 ${n}\n본문`,visibility:'public',revision:1,author:{nickname:`팬${n}`,avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt:'2026-11-05T01:00:00.000Z',updatedAt:'2026-11-05T01:00:00.000Z',isOwner:false,likeCount:n,liked:false,commentCount:0,viewCount:n*1000,...extra});
 it('lists all ten answered posts in the board row with views and likes, and requests the selected period',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:Array.from({length:10},(_,i)=>post(i+1,i===0?{commentCount:3,viewCount:1234567}:{}))}}});
  const {container}=render(<PopularPosts slug='artist' locale='ko'/>);
  expect(container.querySelectorAll('li')).toHaveLength(10);
  const first=container.querySelectorAll('[data-fan-post-row]')[0] as HTMLElement;expect(first).toHaveTextContent('이야기 1');expect(first.querySelector('[aria-label="댓글 3"]')).toHaveTextContent('3');expect(first).not.toHaveTextContent('[3]');const firstLink=first.querySelector('a') as HTMLElement;
  expect(firstLink).toHaveAttribute('href','/c/artist/community/00000000-0000-4000-8000-000000000001?locale=ko&returnTo=%2Fartist%3Ftab%3Dboard%26locale%3Dko%23celebrity-content');
  expect(first).toHaveTextContent('1,234,567');expect(first.querySelector('time')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'주간'}));
  expect(screen.getByRole('heading',{name:'이번 주의 인기글'})).toBeInTheDocument();
  expect(resource).toHaveBeenLastCalledWith('/api/celebrities/artist/popular-posts?period=week&locale=ko',expect.any(Function),false,false,false,true);
  const parse=resource.mock.calls[0]![1] as (value:unknown)=>{items:unknown[]};
  expect(parse({items:[post(1)]}).items).toHaveLength(1);expect(()=>parse({items:Array.from({length:11},(_,i)=>post(i+1))})).toThrow();
 });
 it('shows the selected language in the title and period controls',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[post(1)]}}});
  render(<PopularPosts slug='artist' locale='ja'/>);
  expect(screen.getByRole('heading',{name:'今日の人気の投稿'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'週間'})).toBeInTheDocument();
 });
 it('draws no panel and no empty message for a page without any readable post',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[]}}});
  const {container}=render(<PopularPosts slug='artist' locale='ko'/>);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText('아직 인기글이 없어요.')).toBeNull();
 });
 it('passes the page image to the rows so a post without a photo shows it instead of the document icon',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[post(1)]}}});
  const {container}=render(<PopularPosts slug='artist' locale='ko' pageImage={<span data-testid='page-image'/>}/>);
  expect(container.querySelector('[data-fan-post-row] [data-testid="page-image"]')).not.toBeNull();
  expect(container.querySelector('[data-fan-post-row] svg.lucide-file-text')).toBeNull();
 });
});

it.each(['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru'] as const)('changes all three period titles in %s',locale=>{resource.mockReturnValue({state:{status:'ready',data:{items:[{id:'x',kind:'fan_post',body:'title',visibility:'public',assets:[],author:{nickname:'fan'},createdAt:'2026-11-11T00:00:00Z'}]}}});const view=render(<PopularPosts slug='artist' locale={locale}/>);const titles=new Set<string>();for(const button of screen.getAllByRole('button')){fireEvent.click(button);titles.add(screen.getByRole('heading').textContent!);}expect(titles.size).toBe(3);view.unmount();});
