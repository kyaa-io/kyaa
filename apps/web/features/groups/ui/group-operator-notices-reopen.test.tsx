// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearResources} from '@/components/fan-ui/resource-cache';
import {GroupOperatorNotices} from './group-operator-notices';

// 실제 훅과 실제 저장소로 돈다. 저장 뒤 다시 연 폼이 옛 문서를 받으면 그대로 저장할 때 방금 수정이 지워진다.
vi.mock('@/features/auth/client/cognito-auth',()=>{const getAccessToken=async()=>'token';return {useByUsAuth:()=>({ready:true,authenticated:true,user:{id:'owner'},getAccessToken})};});
vi.mock('@/components/byus-session-provider',()=>({useByUsSession:()=>({ready:true,ownerId:'owner',generation:1,error:null})}));
vi.mock('@/components/locale-provider',()=>({useAppLocale:()=>({locale:'ko'})}));
vi.mock('./group-post-body',()=>({useGroupPostBody:({initial}:{initial?:{body?:string}})=>({field:<output data-testid='body'>{initial?.body}</output>,blocked:false,busy:false,dirty:false,hasContent:true,submission:()=>({bodyDoc:{type:'doc',content:[]},assetIds:[]}),commit:()=>{}})}));

const pageId='e9200000-0000-4000-8000-000000000003',id='e9200000-0000-4000-8000-000000000101';
const row=(title:string,body:string)=>({id,pageId,title,body,visibility:'public',anonymous:false,profileId:null,nickname:'운영',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'});
let server=row('첫 제목','첫 본문'),gate:Promise<void>|null=null,reads:string[]=[];
beforeEach(()=>{
 clearResources();server=row('첫 제목','첫 본문');gate=null;reads=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  if(method==='PATCH'){server=row('새 제목','새 본문');return Response.json({id});}
  if(url.includes('format=rich')){reads.push(url);if(gate)await gate;return Response.json(server);}
  return Response.json({items:[server],nextCursor:null});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

const open=async()=>{fireEvent.click(await screen.findByRole('button',{name:'수정'}));};
const titleField=()=>screen.findByRole('textbox',{name:'제목'});

it('never fills the form with the document read before the save',async()=>{
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 await open();
 expect(await titleField()).toHaveValue('첫 제목');
 fireEvent.submit(view.container.querySelector('form')!);
 await waitFor(()=>expect(view.container.querySelector('form')).toBeNull());
 // 다시 여는 동안 응답을 붙들어, 그 사이 폼이 옛 문서로 열리는지 본다.
 let release=()=>{};gate=new Promise(resolve=>{release=resolve;});
 await open();
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
 expect(view.container.querySelector('form')).toBeNull();
 release();
 expect(await titleField()).toHaveValue('새 제목');
 expect(screen.getByTestId('body')).toHaveTextContent('새 본문');
});
it('reads the server again each time the form opens, even inside the 30 second window',async()=>{
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 await open();
 expect(await titleField()).toHaveValue('첫 제목');
 fireEvent.click(screen.getByRole('button',{name:'취소'}));
 await waitFor(()=>expect(view.container.querySelector('form')).toBeNull());
 server=row('다른 운영자가 고친 제목','다른 운영자가 고친 본문');
 await open();
 expect(await titleField()).toHaveValue('다른 운영자가 고친 제목');
 expect(reads).toHaveLength(2);
});
