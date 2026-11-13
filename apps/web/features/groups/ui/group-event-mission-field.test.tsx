import '@testing-library/jest-dom/vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {GroupEventMissionField,loadEventMissions} from './group-event-mission-field';
import {GroupEventEditor} from './group-activity-editors';
const auth=vi.hoisted(()=>({request:vi.fn(),ready:true,ownerKey:'owner:1'}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>auth}));
vi.mock('./group-image-field',()=>({GroupImageField:()=>null,imageAssetInput:()=>undefined}));
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const mission=(missionId:string,title:string)=>({id:missionId,title,instructions:'조건',imageUrl:null,state:'published',revision:1,rewardPoints:0,status:'available',actionHref:`/pages/groups/${id}/missions/${missionId}`});
const event={id,title:'실제 행사',description:'원문',imageUrl:null,linkedMissionId:other,startsAt:'2026-11-07T10:00:00Z',endsAt:'2026-11-07T12:00:00Z',opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-06T09:00:00Z',location:'서울',capacity:null,requiresApproval:false,state:'draft' as const,revision:1,official:false,entryStatus:'none' as const,ticketAvailable:false};
beforeEach(()=>{auth.ownerKey='owner:1';auth.request.mockReset();});
it('reads all authorized same-page pages and rejects permission/cursor-loop failures',async()=>{
 const request=vi.fn(async(url:string)=>({missions:[mission(url.includes('cursor')?other:id,'미션')],canManage:true,nextCursor:url.includes('cursor')?null:other}));expect(await loadEventMissions(request,id,new AbortController().signal)).toHaveLength(2);expect(request.mock.calls.every(([url])=>url.startsWith(`/api/groups/${id}/missions?`))).toBe(true);
 await expect(loadEventMissions(async()=>({missions:[],canManage:false,nextCursor:null}),id,new AbortController().signal)).rejects.toThrow('FORBIDDEN');await expect(loadEventMissions(async()=>({missions:[],canManage:true,nextCursor:other}),id,new AbortController().signal)).rejects.toThrow('INVALID_CURSOR');
});
it('omits an unchanged link, sends null only when cleared, and preserves unrelated fields',async()=>{
 auth.request.mockImplementation(async(url:string)=>url.includes('/missions?')?{missions:[mission(other,'연결된 실제 미션')],canManage:true,nextCursor:null}:{event});const done=vi.fn();render(<GroupEventEditor pageId={id} locale='ko' initial={event} done={done}/>);const select=await screen.findByRole('combobox',{name:'연결할 적립 활동'});await waitFor(()=>expect(select).toBeEnabled());expect(select).toHaveValue(other);const form=select.closest('form')!;expect(new FormData(form).has('linkedMissionId')).toBe(false);fireEvent.submit(form);await waitFor(()=>expect(done).toHaveBeenCalledOnce());let write=auth.request.mock.calls.find(([,input])=>input?.method==='PATCH');expect(JSON.parse(write![1].body)).not.toHaveProperty('linkedMissionId');
 auth.request.mockClear();fireEvent.change(select,{target:{value:''}});fireEvent.submit(form);await waitFor(()=>expect(done).toHaveBeenCalledTimes(2));write=auth.request.mock.calls.find(([,input])=>input?.method==='PATCH');expect(JSON.parse(write![1].body)).toMatchObject({linkedMissionId:null,title:'실제 행사',expectedRevision:1});expect(JSON.parse(write![1].body)).not.toHaveProperty('cancellationReason');
});
it('clears previous owner options immediately and retries errors without stale choices',async()=>{
 auth.request.mockResolvedValue({missions:[mission(other,'이전 계정 미션')],canManage:true,nextCursor:null});const view=render(<GroupEventMissionField pageId={id} locale='ko' busy={false}/>);await screen.findByRole('option',{name:'이전 계정 미션'});fireEvent.change(screen.getByRole('combobox'),{target:{value:other}});auth.request.mockRejectedValue(new Error('offline'));auth.ownerKey='next:2';view.rerender(<GroupEventMissionField pageId={id} locale='ko' busy={false}/>);expect(screen.queryByRole('option',{name:'이전 계정 미션'})).toBeNull();expect(screen.getByRole('combobox')).toBeDisabled();await screen.findByRole('alert');auth.request.mockResolvedValue({missions:[mission(id,'새 계정 미션')],canManage:true,nextCursor:null});fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));await screen.findByRole('option',{name:'새 계정 미션'});expect(screen.getByRole('combobox')).toHaveValue('');
});
