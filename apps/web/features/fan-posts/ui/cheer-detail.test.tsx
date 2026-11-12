import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {FanPostDetail} from './fan-post-detail';
const state=vi.hoisted(()=>({id:'e9600000-0000-4000-8000-000000000002',slug:'elina',status:'ready',back:'/elina?tab=board',paths:[] as string[],refreshFailed:false,retry:vi.fn(),write:vi.fn(async()=>({updated:true}))}));
vi.mock('next/navigation',()=>({useRouter:()=>({}),useSearchParams:()=>new URLSearchParams({source:'cheer',returnTo:state.back})}));
vi.mock('@/features/auth/client/cognito-auth',()=>({useByUsAuth:()=>({ready:true,authenticated:true,user:{id:'local'}})}));
vi.mock('@/features/fanpage/ui/use-community-resource',()=>({useCommunityResource:(path:string)=>{state.paths.push(path);return {state:{status:state.status,data:{source:'cheer',id:state.id,celebritySlug:state.slug,body:'원문 제목\n원문 본문',clapCount:4,viewerClapped:false}},retry:state.retry,refreshFailed:state.refreshFailed};}}));
vi.mock('@/features/content-safety/ui/use-content-mutation',()=>({useContentMutation:()=>({request:state.write,busy:false,error:null})}));
vi.mock('./post-card',()=>({PostCard:()=>null}));
vi.mock('./cheer-replies',()=>({CheerReplies:({cheerId,slug}:any)=><div data-testid='replies'>{slug}:{cheerId}</div>}));
vi.mock('@/features/content-safety/ui/content-actions',()=>({ContentActions:()=>null,ContentTranslation:({children}:any)=>children}));
beforeEach(()=>{state.id='e9600000-0000-4000-8000-000000000002';state.slug='elina';state.status='ready';state.back='/elina?tab=board';state.paths=[];state.refreshFailed=false;state.retry.mockClear();state.write.mockClear();});
it('keeps original ID/body, cheer replies and safe board return without fan-post API',()=>{
 render(<FanPostDetail postId={state.id} expectedSlug='elina' locale='ko'/>);
 expect(screen.getByRole('heading',{name:'원문 제목'})).toBeInTheDocument();expect(screen.getByText(/원문 본문/)).toBeInTheDocument();
 expect(screen.getByTestId('replies')).toHaveTextContent(`elina:${state.id}`);
 expect(screen.getByRole('link')).toHaveAttribute('href','/elina?tab=board');expect(state.paths.every(path=>path.startsWith('/api/cheers/'))).toBe(true);
});
it('does not render another creator or ID under this detail',()=>{
 state.slug='other';const v=render(<FanPostDetail postId={state.id} expectedSlug='elina' locale='ko'/>);expect(screen.queryByTestId('replies')).toBeNull();expect(screen.getByRole('alert')).toBeInTheDocument();v.unmount();
 state.slug='elina';render(<FanPostDetail postId='e9600000-0000-4000-8000-000000000003' expectedSlug='elina' locale='ko'/>);expect(screen.queryByTestId('replies')).toBeNull();
});
it('does not show detail or replies while unavailable',()=>{state.status='error';render(<FanPostDetail postId={state.id} locale='ko'/>);expect(screen.queryByTestId('replies')).toBeNull();expect(screen.getByRole('button')).toBeInTheDocument();});

it('lets a legacy cheer reader like with the existing clap API',async()=>{
 render(<FanPostDetail postId={state.id} expectedSlug="elina" locale="ko"/>);
 fireEvent.click(screen.getByRole('button',{name:'좋아요 4'}));
 await waitFor(()=>expect(state.write).toHaveBeenCalledWith(`/api/cheers/${state.id}/clap`,'PUT',{selected:true}));
 expect(screen.getByRole('button',{name:'좋아요 5'})).toHaveAttribute('aria-pressed','true');
});

it('keeps a successful like and offers retry when refreshing its count fails',async()=>{
 const view=render(<FanPostDetail postId={state.id} expectedSlug="elina" locale="ko"/>);
 fireEvent.click(screen.getByRole('button',{name:'좋아요 4'}));
 await waitFor(()=>expect(state.retry).toHaveBeenCalledOnce());
 state.refreshFailed=true;
 view.rerender(<FanPostDetail postId={state.id} expectedSlug="elina" locale="ko"/>);
 expect(screen.getByRole('button',{name:'좋아요 5'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('status')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));
 expect(state.retry).toHaveBeenCalledTimes(2);
});
