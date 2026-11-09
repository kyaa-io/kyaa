import '@testing-library/jest-dom/vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GroupOperatorNotices} from './group-operator-notices';
import {operatorToolsCopy} from './operator-tools-copy';

const pageId='e9200000-0000-4000-8000-000000000003';
const list=`/api/groups/${pageId}/posts?category=notice&limit=50`,status=`/api/groups/${pageId}/notice-broadcast`;
const m=vi.hoisted(()=>({request:vi.fn(),retry:vi.fn(),responses:{} as Record<string,unknown>}));
vi.mock('./group-post-body',()=>({useGroupPostBody:()=>({field:<div/>,blocked:false,busy:false,dirty:false,hasContent:true,submission:()=>({body:'본문'}),commit:()=>{}})}));
vi.mock('./use-group-resource',async()=>{
 const react=await import('react');
 class GroupRequestError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
 return {
  GroupRequestError,
  useGroupRequest:()=>({request:m.request,ownerKey:'owner'}),
  useGroupResource:(url:string|null,parse:(v:unknown)=>unknown)=>{const raw=url?m.responses[url]:undefined;return {ownerKey:'owner',data:raw?parse(raw):undefined,error:false,loading:!raw,retry:react.useCallback(()=>m.retry(),[])};},
 };
});
const o=operatorToolsCopy('ko');
const open=()=>{render(<GroupOperatorNotices pageId={pageId} locale='ko'/>);fireEvent.click(screen.getByRole('button',{name:'공지 쓰기'}));fireEvent.change(screen.getByRole('textbox',{name:'제목'}),{target:{value:'운영 공지'}});};
beforeEach(()=>{m.request.mockReset();m.request.mockResolvedValue({id:'e9200000-0000-4000-8000-000000000101'});m.retry.mockReset();m.responses={[list]:{items:[],nextCursor:null}};});
afterEach(()=>{m.responses={};});

it('sends notifyMembers only when the operator checks it',async()=>{
 m.responses[status]={noticeBroadcastEnabled:true,noticeBroadcastRemainingToday:1};
 open();
 const box=screen.getByRole('checkbox',{name:o.notify});
 expect(box).toBeEnabled();expect(box).not.toBeChecked();
 fireEvent.click(box);
 fireEvent.click(screen.getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(m.request).toHaveBeenCalledTimes(1));
 expect(JSON.parse(m.request.mock.calls[0][1].body)).toMatchObject({category:'notice',notifyMembers:true});
});
it('leaves notifyMembers out of the body when unchecked',async()=>{
 m.responses[status]={noticeBroadcastEnabled:true,noticeBroadcastRemainingToday:1};
 open();
 fireEvent.click(screen.getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(m.request).toHaveBeenCalledTimes(1));
 expect(JSON.parse(m.request.mock.calls[0][1].body)).not.toHaveProperty('notifyMembers');
});
it('disables the box with one line once today\'s broadcast is used',()=>{
 m.responses[status]={noticeBroadcastEnabled:true,noticeBroadcastRemainingToday:0};
 open();
 expect(screen.getByRole('checkbox',{name:o.notify})).toBeDisabled();
 expect(screen.getByText(o.notifyUsed)).toBeInTheDocument();
});
it('hides the box while sending is switched off',()=>{
 m.responses[status]={noticeBroadcastEnabled:false,noticeBroadcastRemainingToday:1};
 open();
 expect(screen.queryByRole('checkbox',{name:o.notify})).toBeNull();
});
it('says the broadcast was already used when the server refuses with 409',async()=>{
 const {GroupRequestError}=await import('./use-group-resource');
 m.responses[status]={noticeBroadcastEnabled:true,noticeBroadcastRemainingToday:1};
 m.request.mockRejectedValue(new GroupRequestError(409,'GROUPS_RATE_LIMITED'));
 open();
 fireEvent.click(screen.getByRole('checkbox',{name:o.notify}));
 fireEvent.click(screen.getByRole('button',{name:'저장'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(o.notifyUsed);
 expect(m.retry).toHaveBeenCalled();
});
