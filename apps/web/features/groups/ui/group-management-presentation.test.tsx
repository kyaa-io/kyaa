import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupReportManager} from './group-report-manager';
import {GroupSettingsPanel} from './group-settings-panel';
import {managementCopy} from './management-copy';
import type {GroupDetail} from '../domain/contracts';
const state=vi.hoisted(()=>({request:vi.fn(),retry:vi.fn()}));
const id='10000000-0000-4000-8000-000000000001';
vi.mock('./use-group-resource',()=>({useGroupResource:()=>({ownerKey:'owner',request:state.request,retry:state.retry,loading:false,error:false,data:{items:[{id,targetType:'post',targetId:id,reason:'반복 광고',status:'submitted',createdAt:'2026-11-01',targetPostId:id,targetRoomId:null}],nextCursor:null}})}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null}));
beforeEach(()=>{state.request.mockReset().mockResolvedValue({});state.retry.mockReset();});
it('shows one selected report and preserves the existing escalation API',async()=>{
 render(<GroupReportManager pageId={id} locale='ko'/>);
 expect(screen.queryByRole('textbox')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Kyaa 검토 요청'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'반복 광고 원문을 확인했습니다.'}});
 fireEvent.submit(screen.getByRole('button',{name:'저장'}).closest('form')!);
 await waitFor(()=>expect(state.request).toHaveBeenCalled());
 expect(state.request.mock.calls[0][0]).toBe(`/api/groups/${id}/reports/${id}`);
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({status:'action_requested',remove:false,resolution:'반복 광고 원문을 확인했습니다.',requestId:expect.any(String)});
});
it('changes local notice state without sending an unsupported policy request',()=>{
 render(<GroupReportManager pageId={id} locale='ko' initialTab='posts' localPosts={[{id,title:'원본 게시글',category:'free'}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'공지로 등록'}));
 expect(state.request).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'공지로 등록'})).toBeDisabled();
});
it('keeps fixture board anonymity separate from real page settings and protects owner leave',()=>{
 const save=vi.fn((event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();return new FormData(event.currentTarget);}),leave=vi.fn();
 const detail={page:{id,kind:'hobby',celebrityId:null,slug:null,name:'모임',description:'실제 소개',imageUrl:null,question:null,anonymous:false,memberCount:2},membership:{role:'owner',joinedAt:'2026-11-01'},bookmarked:false} satisfies GroupDetail;
 render(<GroupSettingsPanel detail={detail} locale='ko' pending={false} onSubmit={save} onImageReady={()=>{}} onLeave={leave} localBoards={[{id:'local-board',name:'자유게시판',description:'회원 작성',anonymous:false}]}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'선택한 게시판 익명 설정'}));
 fireEvent.click(screen.getByRole('button',{name:'저장'}));
 const form=save.mock.results[0].value as FormData;
 expect(form.get('anonymous')).toBe('');expect(form.get('name')).toBe('모임');expect(form.get('description')).toBe('실제 소개');
 expect(screen.getByRole('button',{name:managementCopy('ko').leave})).toBeDisabled();expect(leave).not.toHaveBeenCalled();
});
