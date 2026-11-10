import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PopularPosts} from './popular-posts';
const resource=vi.hoisted(()=>vi.fn());
vi.mock('@/features/fanpage/ui/use-community-resource',()=>({useCommunityResource:resource}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
describe('popular posts',()=>{
 it('links to the post and requests the selected ranking period',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[{id:'post-1',body:'첫 번째 이야기\n본문',commentCount:3}]}}});
  render(<PopularPosts slug='artist' locale='ko'/>);
  expect(screen.getByRole('link',{name:'첫 번째 이야기'})).toHaveAttribute('href','/c/artist/community/post-1?locale=ko&returnTo=%2Fartist%3Ftab%3Dboard%26locale%3Dko%23celebrity-content');
  expect(screen.getByText('(3)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'주간'}));
  expect(resource).toHaveBeenLastCalledWith('/api/celebrities/artist/popular-posts?period=week&locale=ko',expect.any(Function),false,false,true);
 });
 it('shows the selected language in the empty state and period controls',()=>{
  resource.mockReturnValue({state:{status:'ready',data:{items:[]}}});
  render(<PopularPosts slug='artist' locale='ja'/>);
  expect(screen.getByRole('heading',{name:'人気の投稿'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'週間'})).toBeInTheDocument();
  expect(screen.getByText('人気の投稿はまだありません。')).toBeInTheDocument();
 });
});
