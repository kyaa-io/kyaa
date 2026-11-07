// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearResources} from '@/components/fan-ui/resource-cache';
import {GroupBoard} from './group-board';

// 실제 훅과 저장소로 돈다. 글 수정 폼도 저장 뒤 옛 문서로 다시 열리면 안 된다.
vi.mock('@/features/auth/client/cognito-auth',()=>{const getAccessToken=async()=>'token';return {useByUsAuth:()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken})};});
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:1,error:null})}));
vi.mock('@/components/locale-provider',()=>({useAppLocale:()=>({locale:'ko'})}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock('./group-post-article',()=>({GroupPostArticle:({post,onEdit}:{post:{title:string};onEdit:()=>void})=><article><h2>{post.title}</h2><button onClick={onEdit}>edit</button></article>}));
vi.mock('./group-post-composer',()=>({GroupPostComposer:({post,onSubmit,onCancel}:{post?:{title:string};onSubmit:(input:Record<string,unknown>)=>Promise<boolean>;onCancel:(dirty:boolean)=>void})=><form aria-label='composer'><output>{post?.title}</output><button type='button' onClick={()=>void onSubmit({title:'새 제목'})}>save</button><button type='button' onClick={()=>onCancel(false)}>cancel</button></form>}));

const pageId='20000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000001';
const row=(title:string)=>({id,pageId,title,body:title,visibility:'public',anonymous:false,profileId:null,nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'});
const detail={page:{id:pageId,kind:'hobby' as const,celebrityId:null,slug:null,name:'Running',description:'Run',imageUrl:null,question:null,memberCount:1},membership:{role:'member'},bookmarked:false} as never;
let server=row('첫 제목'),fail=false,gate:Promise<void>|null=null;
beforeEach(()=>{
 clearResources();server=row('첫 제목');fail=false;gate=null;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  if(method==='PATCH'){server=row('새 제목');return Response.json({id});}
  if(url.includes('format=rich')){if(gate)await gate;if(fail)return Response.json({error:{code:'X'}},{status:500});return Response.json(server);}
  return Response.json({items:[server],nextCursor:null});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const composer=()=>screen.queryByRole('form',{name:'composer'});
const edit=async()=>fireEvent.click(await screen.findByRole('button',{name:'edit'}));

it('opens the edit form only with the document read after the save',async()=>{
 render(<GroupBoard detail={detail} locale='ko' initialPostId={id}/>);
 await edit();
 await waitFor(()=>expect(composer()).toHaveTextContent('첫 제목'));
 fireEvent.click(screen.getByRole('button',{name:'save'}));
 await waitFor(()=>expect(composer()).toBeNull());
 let release=()=>{};gate=new Promise(resolve=>{release=resolve;});
 await edit();
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
 expect(composer()).toBeNull();
 release();
 await waitFor(()=>expect(composer()).toHaveTextContent('새 제목'));
});
it('offers a retry and a way back when the edit read fails',async()=>{
 render(<GroupBoard detail={detail} locale='ko' initialPostId={id}/>);
 await edit();
 await waitFor(()=>expect(composer()).toBeInTheDocument());
 fireEvent.click(screen.getByRole('button',{name:'cancel'}));
 await waitFor(()=>expect(composer()).toBeNull());
 fail=true;
 await edit();
 const retry=await screen.findByRole('button',{name:'다시 시도'});
 expect(composer()).toBeNull();
 fail=false;
 fireEvent.click(retry);
 await waitFor(()=>expect(composer()).toHaveTextContent('첫 제목'));
});
