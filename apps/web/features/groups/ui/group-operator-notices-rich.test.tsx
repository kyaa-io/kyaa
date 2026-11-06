import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupOperatorNotices} from './group-operator-notices';

const pageId='e9200000-0000-4000-8000-000000000003',id='e9200000-0000-4000-8000-000000000101',asset='e9200000-0000-4000-8000-000000000201';
const row={id,pageId,title:'공지 1',body:'본문 1',visibility:'members',anonymous:false,profileId:null,nickname:'운영',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'};
const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'본문 1',marks:[{type:'bold'}]}]}]};
const list=`/api/groups/${pageId}/posts?category=notice&limit=50`,detailUrl=`/api/groups/${pageId}/posts/${id}?format=rich`;
const m=vi.hoisted(()=>({request:vi.fn(),commit:vi.fn(),initial:[] as unknown[],blocked:false,responses:{} as Record<string,unknown>,failed:new Set<string>(),retry:vi.fn(),urls:[] as string[]}));
vi.mock('./use-group-resource',()=>({
 useGroupRequest:()=>({request:m.request,ownerKey:'owner'}),
 useGroupResource:(url:string|null,parse:(v:unknown)=>unknown)=>{if(url)m.urls.push(url);const raw=url?m.responses[url]:undefined;return {ownerKey:'owner',data:raw?parse(raw):undefined,error:Boolean(url&&m.failed.has(url)),loading:Boolean(url&&!raw),retry:m.retry};},
}));
vi.mock('./group-post-body',()=>({useGroupPostBody:({initial}:{initial?:unknown})=>{m.initial.push(initial);return {field:<div data-testid='rich-field'/>,blocked:m.blocked,busy:false,dirty:false,hasContent:true,submission:()=>({bodyDoc:doc,assetIds:[asset]}),commit:m.commit};}}));
beforeEach(()=>{m.request.mockReset();m.request.mockResolvedValue({id});m.commit.mockReset();m.retry.mockReset();m.initial.length=0;m.urls.length=0;m.blocked=false;m.failed=new Set();m.responses={[list]:{items:[row],nextCursor:null}};});
afterEach(()=>cleanup());
const input=()=>JSON.parse(m.request.mock.calls[0][1].body);

it('opens a new notice with the shared editor and sends the document, attachments and the notice category',async()=>{
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'공지 쓰기'}));
 expect(screen.getByTestId('rich-field')).toBeInTheDocument();
 expect(view.container.querySelector('textarea')).toBeNull();
 expect(m.initial.at(-1)).toBeUndefined();
 fireEvent.change(screen.getByRole('textbox',{name:'제목'}),{target:{value:'새 공지'}});
 fireEvent.submit(view.container.querySelector('form')!);
 await waitFor(()=>expect(m.commit).toHaveBeenCalledOnce());
 expect(m.request.mock.calls[0][0]).toBe(`/api/groups/${pageId}/posts`);
 expect(input()).toMatchObject({title:'새 공지',bodyDoc:doc,assetIds:[asset],category:'notice',visibility:'public'});
});
it('reads the rich detail before editing and hands it over, not the list row',async()=>{
 m.responses[detailUrl]={...row,body:'본문 1',bodyDoc:doc,assets:[{id:asset,kind:'image',width:10,height:10}]};
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 expect(m.urls).not.toContain(detailUrl);
 fireEvent.click(screen.getByRole('button',{name:'수정'}));
 expect(m.urls).toContain(detailUrl);
 expect(m.initial.at(-1)).toMatchObject({body:'본문 1',bodyDoc:doc,assets:[{id:asset,kind:'image'}]});
 expect(screen.getByRole('textbox',{name:'제목'})).toHaveValue('공지 1');
 expect(screen.queryByRole('heading',{level:3})).toBeNull();
 expect(view.container.querySelector('select')).toHaveValue('members');
 fireEvent.submit(view.container.querySelector('form')!);
 await waitFor(()=>expect(m.commit).toHaveBeenCalledOnce());
 expect(m.request.mock.calls[0][0]).toBe(`/api/groups/${pageId}/posts/${id}`);
 expect(m.request.mock.calls[0][1].method).toBe('PATCH');
 expect(input()).toMatchObject({bodyDoc:doc,assetIds:[asset],visibility:'members',category:'notice'});
});
it('never opens the form from the list row while the detail is loading',()=>{
 render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'수정'}));
 expect(screen.queryByTestId('rich-field')).toBeNull();
 expect(m.initial).toHaveLength(0);
});
it('offers a retry and no form when the detail fails, so formatting cannot be lost',()=>{
 m.failed.add(detailUrl);
 render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'수정'}));
 expect(screen.queryByTestId('rich-field')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));
 expect(m.retry).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'취소'}));
 expect(screen.getByRole('heading',{level:3,name:'공지 1'})).toBeInTheDocument();
});
it('keeps the input and does not commit uploads when saving fails',async()=>{
 m.request.mockRejectedValueOnce(new Error('offline'));
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'공지 쓰기'}));
 fireEvent.change(screen.getByRole('textbox',{name:'제목'}),{target:{value:'새 공지'}});
 fireEvent.submit(view.container.querySelector('form')!);
 await screen.findByRole('alert');
 expect(m.commit).not.toHaveBeenCalled();
 expect(screen.getByRole('textbox',{name:'제목'})).toHaveValue('새 공지');
});
it('sends nothing while the body is blocked',()=>{
 m.blocked=true;
 const view=render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);
 fireEvent.click(screen.getByRole('button',{name:'공지 쓰기'}));
 fireEvent.change(screen.getByRole('textbox',{name:'제목'}),{target:{value:'새 공지'}});
 expect(screen.getByRole('button',{name:'저장'})).toBeDisabled();
 fireEvent.submit(view.container.querySelector('form')!);
 expect(m.request).not.toHaveBeenCalled();
});
