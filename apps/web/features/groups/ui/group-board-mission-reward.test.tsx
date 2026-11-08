// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearResources} from '@/components/fan-ui/resource-cache';
import {GroupBoard} from './group-board';

// K6: 모임 글 저장 응답의 reward를 팬 글과 같은 지급 토스트·미지급 안내로 띄운다. 수정 저장은 띄우지 않는다.
const toast=vi.hoisted(()=>({reward:vi.fn(),fan:vi.fn(),activity:vi.fn()}));
vi.mock('@/components/fan-ui/fan-activity-updates',async importOriginal=>({...await importOriginal<object>(),notifyFanActivityUpdated:toast.activity}));
vi.mock('@/features/fan-posts/ui/mission-reward-toast',()=>({showMissionRewardToast:toast.reward}));
vi.mock('@/components/fan-ui/fan-toast',()=>({showFanToast:toast.fan}));
vi.mock('@/features/auth/client/cognito-auth',()=>{const getAccessToken=async()=>'token';return {useByUsAuth:()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken})};});
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:1,error:null})}));
vi.mock('@/components/locale-provider',()=>({useAppLocale:()=>({locale:'ko'})}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock('./group-post-article',()=>({GroupPostArticle:({post,onEdit}:{post:{title:string};onEdit:()=>void})=><article><h2>{post.title}</h2><button onClick={onEdit}>edit</button></article>}));
vi.mock('./group-post-composer',()=>({GroupPostComposer:({onSubmit}:{onSubmit:(input:Record<string,unknown>)=>Promise<boolean>})=><form aria-label='composer'><button type='button' onClick={()=>void onSubmit({title:'응'})}>save</button></form>}));

const pageId='20000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000001';
const row={id,pageId,title:'응',body:'응',visibility:'public',anonymous:false,profileId:null,nickname:'팬',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'};
const detail={page:{id:pageId,kind:'fan' as const,celebrityId:'30000000-0000-4000-8000-000000000003',slug:null,name:'Fans',description:'d',imageUrl:null,question:null,memberCount:1},membership:{role:'member'},bookmarked:false} as never;
let answer:Record<string,unknown>={};
beforeEach(()=>{
 clearResources();toast.reward.mockClear();toast.fan.mockClear();toast.activity.mockClear();
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const method=init?.method??'GET';
  if(method==='POST')return Response.json({...row,...answer});
  if(method==='PATCH')return Response.json({...row,reward:{points:20,stamps:0}});
  if(String(input).includes('format=rich'))return Response.json(row);
  return Response.json({items:[row],nextCursor:null});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const post=async()=>{fireEvent.click(await screen.findByRole('button',{name:'글쓰기'}));fireEvent.click(await screen.findByRole('button',{name:'save'}));await waitFor(()=>expect(screen.queryByRole('form',{name:'composer'})).toBeNull());};

it('celebrates what a new group post paid, with the fan-post toast',async()=>{
 answer={reward:{points:20,stamps:1}};
 render(<GroupBoard detail={detail} locale='ko'/>);
 await post();
 expect(toast.reward).toHaveBeenCalledWith('ko','post',{points:20,stamps:1});
 expect(toast.fan).not.toHaveBeenCalled();
});
it('asks the fan activity summary to read again after a new group post, as a fan post does',async()=>{
 answer={};
 render(<GroupBoard detail={detail} locale='ko'/>);
 await post();
 expect(toast.activity).toHaveBeenCalledTimes(1);
 expect(toast.activity).toHaveBeenCalledWith('owner');
});
it('says why a new group post paid nothing',async()=>{
 answer={reward:{points:0,stamps:0,skippedReason:'daily_limit'}};
 render(<GroupBoard detail={detail} locale='ko'/>);
 await post();
 expect(toast.reward).not.toHaveBeenCalled();
 expect(toast.fan).toHaveBeenCalledWith({title:'오늘 글쓰기 포인트는 모두 받았어요',tone:'neutral'});
});
it('stays quiet without a reward and on an edit',async()=>{
 answer={};
 render(<GroupBoard detail={detail} locale='ko' initialPostId={id}/>);
 fireEvent.click(await screen.findByRole('button',{name:'edit'}));
 fireEvent.click(await screen.findByRole('button',{name:'save'}));
 await waitFor(()=>expect(screen.queryByRole('form',{name:'composer'})).toBeNull());
 expect(toast.reward).not.toHaveBeenCalled();
 expect(toast.fan).not.toHaveBeenCalled();
 expect(toast.activity).not.toHaveBeenCalled();
});
