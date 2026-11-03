import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupBoard} from './group-board';
const state=vi.hoisted(()=>({urls:[] as string[]}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null,parse:(value:unknown)=>unknown)=>{
 const common={ownerKey:'viewer',authenticated:true,error:false,loading:false,retry:vi.fn(),request:vi.fn()};
 if(!url)return common;
 state.urls.push(url);
 const query=new URL(url,'https://local.test').searchParams,limit=Number(query.get('limit')),offset=Number(query.get('cursor')?.slice(-12)??0);
 const items=Array.from({length:Math.min(limit,21-offset)},(_,index)=>({id:`10000000-0000-4000-8000-${String(offset+index+1).padStart(12,'0')}`,pageId:'20000000-0000-4000-8000-000000000001',title:`Story ${offset+index+1}`,body:'Original body',visibility:'public',anonymous:false,profileId:null,nickname:'Writer',avatarUrl:null,createdAt:'2026-11-01T10:00:00Z'}));
 return {...common,data:parse({items,nextCursor:offset+limit<21?items.at(-1)!.id:null})};
}}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>({items:[],busy:false,ready:true})}));
const detail={page:{id:'20000000-0000-4000-8000-000000000001',kind:'hobby' as const,celebrityId:null,slug:null,name:'Running',description:'Run together',imageUrl:null,question:null,memberCount:84},membership:null,bookmarked:false};
beforeEach(()=>{state.urls=[];});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requests twenty desktop preview rows and changes pages without accumulating the prior page',()=>{
 render(<GroupBoard detail={detail} locale='en' preview/>);
 expect(state.urls.some(url=>url.includes('limit=20'))).toBe(true);
 expect(screen.getAllByRole('button',{name:/^Story /})).toHaveLength(20);
 fireEvent.click(screen.getByRole('button',{name:'2'}));
 expect(screen.getByRole('button',{name:/^Story 21/})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/^Story 1\b/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Previous'}));
 expect(screen.getAllByRole('button',{name:/^Story /})).toHaveLength(20);
});
it('requests five mobile preview rows while keeping full-board limit unchanged',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 const view=render(<GroupBoard detail={detail} locale='en' preview/>);
 expect(state.urls.some(url=>url.includes('limit=5'))).toBe(true);
 expect(screen.getAllByRole('button',{name:/^Story /})).toHaveLength(5);
 view.rerender(<GroupBoard detail={detail} locale='en'/>);
 expect(state.urls.at(-1)).toContain('limit=30');
});
