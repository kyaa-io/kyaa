import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupBoard} from './group-board';
const state=vi.hoisted(()=>({urls:[] as string[]}));
vi.mock('./use-group-resource',()=>({useGroupResource:(url:string|null,parse:(value:unknown)=>unknown)=>{
 const common={ownerKey:'viewer',authenticated:true,error:false,loading:false,retry:vi.fn(),request:vi.fn()};
 if(!url)return common;
 state.urls.push(url);
 const query=new URL(url,'https://local.test').searchParams,limit=Number(query.get('limit')),offset=Number(query.get('cursor')?.slice(-12)??0);
 const items=Array.from({length:Math.min(limit,21-offset)},(_,index)=>({id:`10000000-0000-4000-8000-${String(offset+index+1).padStart(12,'0')}`,pageId:'20000000-0000-4000-8000-000000000001',title:`Story ${offset+index+1}`,body:'Original body',visibility:'public',anonymous:false,profileId:null,nickname:'Writer',avatarUrl:null,createdAt:'2026-11-01T10:00:00Z',editedAt:offset+index===0?'2026-11-02T10:00:00Z':null}));
 return {...common,data:parse({items,nextCursor:offset+limit<21?items.at(-1)!.id:null})};
}}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>({items:[],busy:false,ready:true})}));
const detail={page:{id:'20000000-0000-4000-8000-000000000001',kind:'hobby' as const,celebrityId:null,slug:null,name:'Running',description:'Run together',imageUrl:null,question:null,memberCount:84},membership:null,bookmarked:false};
beforeEach(()=>{state.urls=[];});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requests twenty desktop preview rows and changes pages without accumulating the prior page',()=>{
 render(<GroupBoard detail={detail} locale='en' preview/>);
 expect(state.urls.some(url=>url.includes('limit=20'))).toBe(true);
 expect(screen.getAllByRole('link',{name:/^Story /})).toHaveLength(20);
 fireEvent.click(screen.getByRole('button',{name:'2'}));
 expect(screen.getByRole('link',{name:/^Story 21/})).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:/^Story 1\b/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Previous'}));
 expect(screen.getAllByRole('link',{name:/^Story /})).toHaveLength(20);
});
it('requests five mobile preview rows while keeping full-board limit unchanged',()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 const view=render(<GroupBoard detail={detail} locale='en' preview/>);
 expect(state.urls.some(url=>url.includes('limit=5'))).toBe(true);
 expect(screen.getAllByRole('link',{name:/^Story /})).toHaveLength(5);
 view.rerender(<GroupBoard detail={detail} locale='en'/>);
 expect(state.urls.at(-1)).toContain('limit=30');
});
it('shows board row times as HH:mm today and MM. DD. after, in post rows with no empty columns',()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  vi.setSystemTime(new Date('2026-11-01T10:00:30Z'));
  const view=render(<GroupBoard detail={detail} locale='ko' preview/>);
  expect(view.container.querySelector('time')?.textContent).toMatch(/^\d{2}:\d{2}$/);
  expect(view.container.querySelectorAll('[data-fan-post-row]').length).toBeGreaterThan(0);
  expect(view.container.textContent).not.toContain('—');
  view.unmount();
  vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
  const later=render(<GroupBoard detail={detail} locale='ko' preview/>);
  expect(later.container.querySelector('time')?.textContent).toMatch(/^11\. 01\.$/);
 }finally{vi.useRealTimers();}
});

it('keeps the write action for a visitor who has not joined and sends it to the join flow',()=>{
 const onJoin=vi.fn();
 render(<GroupBoard detail={detail} locale='ko' preview onJoin={onJoin}/>);
 fireEvent.click(screen.getByRole('button',{name:'글쓰기'}));
 expect(onJoin).toHaveBeenCalledTimes(1);
});

it('shows the edited mark beside the time in preview and board rows only for edited posts',()=>{
 const view=render(<GroupBoard detail={detail} locale='ko' preview/>);
 for (const preview of [true,false]) {
  if (!preview) view.rerender(<GroupBoard detail={detail} locale='ko'/>);
  const rows=view.container.querySelectorAll('[data-fan-post-row]');
  const mark=rows[0].querySelector('[data-edited-mark]');
  expect(mark).toHaveTextContent('수정됨');
  expect(rows[0].querySelector('time')?.nextElementSibling).toBe(mark);
  expect(rows[1].querySelector('[data-edited-mark]')).toBeNull();
 }
});
